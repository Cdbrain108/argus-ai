"""In-memory conversation sessions for the stateless HTTP API."""
from __future__ import annotations

from datetime import datetime, timezone
import uuid

from backend.models.session import ChatSession

_SESSIONS: dict[str, ChatSession] = {}


def create_session(dataset_id: str | None = None) -> ChatSession:
    session = ChatSession(session_id=uuid.uuid4().hex, dataset_id=dataset_id)
    _SESSIONS[session.session_id] = session
    return session


def get_session(session_id: str) -> ChatSession | None:
    return _SESSIONS.get(session_id)


def get_or_create(session_id: str | None, dataset_id: str | None = None) -> ChatSession:
    session = get_session(session_id) if session_id else None
    if session is None:
        session = create_session(dataset_id)
    elif dataset_id and not session.dataset_id:
        session.dataset_id = dataset_id
    return session


def append_message(session: ChatSession, role: str, content: str, **metadata) -> None:
    session.history.append({
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **metadata,
    })


def list_sessions() -> list[dict]:
    return [
        {
            "session_id": s.session_id,
            "dataset_id": s.dataset_id,
            "message_count": len(s.history),
            "title": next((m["content"][:80] for m in s.history if m.get("role") == "user"), "New analysis"),
        }
        for s in _SESSIONS.values()
    ]
