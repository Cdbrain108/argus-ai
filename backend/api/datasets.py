from __future__ import annotations
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/api/datasets", tags=["datasets"])
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
DEMO_CANDIDATES = ("demo_data.csv", "daily-bike-share.csv")

_MAX_BYTES = 50 * 1024 * 1024
_CHUNK_BYTES = 1024 * 1024

#: Any delimited text file is readable now that the loader sniffs its separator,
#: so the gate no longer has to be narrower than the reader.
_ALLOWED_SUFFIXES = (
    ".csv", ".tsv", ".txt", ".tab", ".psv", ".dat",
    ".json", ".jsonl", ".parquet",
    ".xlsx", ".xls", ".xlsm",
)


async def _read_capped(file: UploadFile) -> bytes:
    """Read the upload without ever holding more than the cap in memory.

    The previous version awaited `file.read()` — the *whole* body — and only then
    compared its length to the limit, so a 2 GB upload was fully buffered before
    being rejected.
    """
    declared = getattr(file, "size", None)
    if declared is None:
        raw = (file.headers or {}).get("content-length")
        declared = int(raw) if raw and str(raw).isdigit() else None
    if declared is not None and declared > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50 MB upload limit")

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > _MAX_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds the 50 MB upload limit")
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    return b"".join(chunks)


def _session_payload(session) -> dict:
    df = session.df
    report = session.load_report or {}
    from backend.analysis.adapters import build_analysis_capabilities
    return {
        "dataset_id": session.dataset_id,
        "filename": session.filename,
        "dataset_name": session.dataset_name,
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": [str(c) for c in df.columns],
        "dtypes": {str(c): str(t) for c, t in df.dtypes.items()},
        "missing_total": int(df.isnull().sum().sum()),
        # What the loader inferred and converted, so the UI can show a
        # "parsed from text" badge and the reason behind every coercion.
        "column_types": list(session.column_types.values()),
        "converted_columns": report.get("converted_columns", []),
        "dropped_columns": report.get("dropped_columns", []),
        "dropped_rows": report.get("dropped_rows", 0),
        "tokens_nulled": report.get("tokens_nulled", 0),
        "delimiter": report.get("delimiter"),
        "encoding": report.get("encoding"),
        "sheet_names": report.get("sheet_names"),
        "active_sheet": report.get("active_sheet"),
        "capabilities": build_analysis_capabilities(df),
    }


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    from backend.services import dataset_service as ds
    filename = file.filename or "upload.csv"
    if not filename.lower().endswith(_ALLOWED_SUFFIXES):
        raise HTTPException(
            status_code=415,
            detail="Supported files: CSV, TSV, delimited TXT, JSON, JSONL, Parquet, and Excel (.xlsx, .xls, .xlsm)",
        )
    content = await _read_capped(file)
    try:
        session = ds.create_dataset_session(content, filename)
    except ValueError as exc:
        # The loader raises ValueError only with messages written for the user
        # (unsupported type, no parseable rows, missing openpyxl).
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        # Anything else is a bug on our side; the traceback belongs in the log,
        # not in the HTTP response.
        log.exception("Upload failed for %s", filename)
        raise HTTPException(
            status_code=400,
            detail="Could not read this file. Check that it is a valid CSV or Excel file and try again.",
        )
    return _session_payload(session)


@router.post("/demo")
def load_demo_dataset():
    """Load the bundled sample file so the landing page's "Try Live Demo" button
    works without the visitor having to find a dataset first."""
    from backend.services import dataset_service as ds

    for name in DEMO_CANDIDATES:
        path = ROOT / name
        if path.is_file():
            session = ds.create_dataset_session(path.read_bytes(), name, "Demo Dataset")
            return _session_payload(session)
    raise HTTPException(status_code=404, detail="No demo dataset is bundled with this deployment")


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    from backend.services import dataset_service as ds
    try:
        return ds.get_profile(dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{dataset_id}/preview")
def preview_dataset(dataset_id: str, n_rows: int = 100):
    from backend.services import dataset_service as ds
    try:
        return ds.get_preview(dataset_id, n_rows)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{dataset_id}/health")
def dataset_health(dataset_id: str):
    from backend.tools.registry import execute_tool
    from backend.services.dataset_service import get_dataset
    if get_dataset(dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return execute_tool("analyze_dataset_health", dataset_id)


@router.get("/{dataset_id}/narrative")
def dataset_narrative(dataset_id: str, refresh: bool = False):
    """The AI description the workspace types out after an upload.

    Cached on the session: it costs a model call, and it describes the file as
    uploaded, which does not change. `refresh=true` forces a regeneration.
    """
    from backend.services.dataset_service import get_dataset
    from backend.services.narration import narrate_dataset

    session = get_dataset(dataset_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if session.narrative is None or refresh:
        session.narrative = narrate_dataset(session)
    return session.narrative


@router.get("")
def list_all_datasets():
    from backend.services import dataset_service as ds
    return ds.list_datasets()


@router.get("/{dataset_id}/columns")
def dataset_columns(dataset_id: str):
    from backend.services import dataset_service as ds
    s = ds.get_dataset(dataset_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"columns": s.column_summary()}
