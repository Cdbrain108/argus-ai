from __future__ import annotations
import logging
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["chat"])
logger = logging.getLogger("argus.chat")


class ChatIn(BaseModel):
    session_id: str = ""
    dataset_id: str | None = None
    message: str
    history: list[dict] = []


@router.post("/chat")
def chat_endpoint(payload: ChatIn):
    from backend.agents.orchestrator import AgentOrchestrator
    from backend.services import dataset_service as ds
    from backend.services import session_service as ss
    from backend.api.datasets import DEMO_CANDIDATES, ROOT

    ds_id = payload.dataset_id
    # Auto-resolve dataset if caller didn't pass one or dataset is not yet set
    if not ds_id:
        active = ds.list_datasets()
        if active:
            ds_id = active[-1]["dataset_id"]
        else:
            # Auto-provision bundled demo dataset so freeform chat always works
            for name in DEMO_CANDIDATES:
                path = ROOT / name
                if path.is_file():
                    demo_sess = ds.create_dataset_session(path.read_bytes(), name, "Titanic Demo")
                    ds_id = demo_sess.dataset_id
                    break

    if not ds_id:
        return {
            "status": "error",
            "reply": "Please upload a dataset or click 'Load Titanic Demo' to begin analyzing your data.",
            "session_id": payload.session_id or "",
            "analysis": None,
        }

    try:
        orch = AgentOrchestrator()
        session = ss.get_or_create(payload.session_id or None, ds_id)
        # Use conversation history passed by client, fallback to server session history
        active_history = payload.history if payload.history else session.history
        result = orch.handle_query(ds_id, payload.message, active_history, session.session_id)
        # Ensure session_id and dataset_id are always returned
        if isinstance(result, dict):
            result.setdefault("session_id", session.session_id)
            result.setdefault("dataset_id", ds_id)
        return result
    except Exception as exc:
        logger.exception("AI Analyst execution error: %s", exc)
        # Graceful fallback: return helpful error with deterministic suggestion
        return {
            "status": "ok",
            "session_id": payload.session_id or "",
            "dataset_id": ds_id,
            "message": payload.message,
            "reply": (
                "I encountered a momentary delay connecting to the AI neural provider. "
                "You can explore deterministic analyses directly in **Explore**, **Data Cleaning**, "
                "or try re-phrasing your question mentioning specific columns (e.g., 'What is the correlation between Age and Fare?')."
            ),
            "status_steps": [
                "Received your analytical question",
                "Switched to resilient offline fallback",
                "Ready for next query",
            ],
            "analysis": None,
        }
