from __future__ import annotations
from backend.agents.orchestrator import AgentOrchestrator

_orchestrator = AgentOrchestrator()


def analyze_query(dataset_id: str, message: str, history=None):
    return _orchestrator.handle_query(dataset_id, message, history or [])
