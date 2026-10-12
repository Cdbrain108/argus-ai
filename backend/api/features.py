from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["features"])


class FeatureIn(BaseModel):
    dataset_id: str
    target: str | None = None


@router.post("/feature-discovery/run")
def feature_discovery(payload: FeatureIn):
    # Routed through the analysis service rather than straight to the tool, so a
    # discovery run lands in the session's analysis history and gets the same AI
    # narrative every other analysis gets.
    from backend.services.analysis_service import run_analysis
    if payload.target:
        return run_analysis(payload.dataset_id, "feature_importance", columns=[payload.target])
    return run_analysis(payload.dataset_id, "feature_discovery")
