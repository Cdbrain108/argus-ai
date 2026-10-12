from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import session_service as ss

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionIn(BaseModel):
    dataset_id: str | None = None


@router.post("")
def create(payload: SessionIn = SessionIn()):
    session = ss.create_session(payload.dataset_id)
    return {"session_id": session.session_id, "dataset_id": session.dataset_id, "history": []}


@router.get("")
def list_all():
    return ss.list_sessions()


@router.get("/{session_id}")
def get(session_id: str):
    session = ss.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session.session_id, "dataset_id": session.dataset_id, "history": session.history}


@router.get("/{session_id}/history")
def history(session_id: str):
    session = ss.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "history": session.history}
