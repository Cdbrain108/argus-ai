from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class RunIn(BaseModel):
    dataset_id: str
    analysis_type: str
    columns: list[str] | None = None
    parameters: dict | None = None


@router.post("/run")
def run_analysis(payload: RunIn):
    from backend.services.analysis_service import run_analysis as svc
    try:
        return svc(payload.dataset_id, payload.analysis_type, payload.columns, payload.parameters)
    except ValueError as exc:
        # Invalid columns/options are actionable input errors.
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{analysis_id}")
def get_analysis(analysis_id: str):
    from backend.services.dataset_service import list_datasets, get_dataset
    for item in list_datasets():
        session = get_dataset(item["dataset_id"])
        # `get_dataset` returns None for an id it does not hold, and a session can
        # be evicted between listing and lookup, so this must not dereference blindly.
        if session is None:
            continue
        for result in reversed(session.analysis_history):
            if result.get("analysis_id") == analysis_id:
                return result
    raise HTTPException(status_code=404, detail="Analysis not found")
