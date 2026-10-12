from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["chat"])


class ChatIn(BaseModel):
    session_id: str = ""
    dataset_id: str | None = None
    message: str


@router.post("/chat")
def chat_endpoint(payload: ChatIn):
    from backend.agents.orchestrator import AgentOrchestrator
    if not payload.dataset_id:
        return {"message": "Please upload a dataset first."}
    orch = AgentOrchestrator()
    from backend.services import session_service as ss
    session = ss.get_or_create(payload.session_id or None, payload.dataset_id)
    return orch.handle_query(payload.dataset_id, payload.message, session.history, session.session_id)
