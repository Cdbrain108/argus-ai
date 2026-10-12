from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import io

router = APIRouter(prefix="/api/cleaning", tags=["cleaning"])


class ScanIn(BaseModel):
    dataset_id: str


@router.post("/scan")
def scan(payload: ScanIn):
    from backend.tools.registry import execute_tool
    return execute_tool("clean_dataset", payload.dataset_id, apply_cleaning=False)


@router.post("/apply")
def apply_cleaning(payload: ScanIn):
    # Through the analysis service so the applied plan is narrated and recorded
    # in the session history. The scan above stays a direct tool call: it is a
    # pre-flight listing the user reads before deciding, not a result to explain.
    from backend.services.analysis_service import run_analysis
    return run_analysis(payload.dataset_id, "cleaning", params={"apply_cleaning": True})


@router.get("/{dataset_id}/download")
def download_cleaned(dataset_id: str):
    from backend.services.dataset_service import get_dataset

    session = get_dataset(dataset_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if session.cleaned_df is None:
        raise HTTPException(status_code=409, detail="Apply the cleaning plan before downloading the cleaned dataset")
    buffer = io.StringIO()
    session.cleaned_df.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="argus-cleaned-{session.filename.rsplit(".", 1)[0]}.csv"'},
    )
