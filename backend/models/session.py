from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class ChatSession:
    session_id: str
    dataset_id: str | None = None
    history: list = field(default_factory=list)
