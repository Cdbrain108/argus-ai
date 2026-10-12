from __future__ import annotations
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from backend.api import datasets, chat, analysis, cleaning, features, reports, auth, sessions

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="ARGUS Agentic Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(datasets.router)
app.include_router(chat.router)
app.include_router(analysis.router)
app.include_router(cleaning.router)
app.include_router(features.router)
app.include_router(reports.router)
app.include_router(sessions.router)

if (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")


@app.on_event("startup")
def startup_warmup():
    """Pre-compiles LangGraph StateGraph on boot to eliminate first-query cold start latency."""
    try:
        from backend.agents.graph import get_analyst_graph
        get_analyst_graph()
    except Exception as e:
        print(f"[ARGUS] Graph warmup notice: {e}")



@app.get("/health")
@app.get("/api/health")
def health():
    from backend.services.llm import provider_status
    return {"ok": True, "service": "argus-backend", "llm": provider_status()}


def _spa() -> FileResponse:
    """The built React shell. There is no HTML fallback: a missing bundle is a
    build problem, and silently serving a different page hides it."""
    shell = FRONTEND_DIST / "index.html"
    if not shell.is_file():
        raise HTTPException(
            status_code=503,
            detail="Frontend bundle not found. Run `npm install && npm run build` in frontend/.",
        )
    return FileResponse(shell)


@app.get("/", include_in_schema=False)
def index():
    return _spa()


@app.get("/workflow", include_in_schema=False)
def workflow():
    return FileResponse(ROOT / "ARGUS_Workflow_Diagram.html")


@app.get("/{asset_path:path}", include_in_schema=False)
def spa_catch_all(asset_path: str):
    """Serve Vite `public/` files (logo, preview image) and otherwise hand back
    the SPA shell so a client-side route survives a page refresh. Declared last
    so every API router above keeps priority over it."""
    # Without this, an unknown /api path would fall through to the HTML shell and
    # the frontend's `response.json()` would quietly yield {} on a 200.
    if asset_path.startswith("api/"):
        raise HTTPException(status_code=404, detail=f"No such endpoint: /{asset_path}")
    if asset_path:
        candidate = (FRONTEND_DIST / asset_path).resolve()
        if FRONTEND_DIST.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
    return _spa()
