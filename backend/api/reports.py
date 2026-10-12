from __future__ import annotations
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/reports", tags=["reports"])


class GenIn(BaseModel):
    dataset_id: str | None = None
    session_id: str | None = None


@router.post("/generate")
def generate(payload: GenIn):
    from backend.services import report_service as rs
    try:
        return rs.generate_report(payload.dataset_id, payload.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("")
def list_all():
    from backend.services import report_service as rs
    return rs.list_reports()


@router.get("/{report_id}")
def get_one(report_id: str):
    from backend.services import report_service as rs
    rec = rs.get_report(report_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return rec


@router.get("/{report_id}/download")
def download(report_id: str):
    from backend.services import report_service as rs
    rec = rs.get_report(report_id)
    if rec is None or not rec.get("pdf_path"):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(rec["pdf_path"], media_type="application/pdf", filename=f"argus-{report_id}.pdf")
