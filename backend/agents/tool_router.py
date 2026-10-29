from __future__ import annotations
from typing import Any, Dict
from backend.agents.planner import INTENT_TO_TOOL
from backend.tools.registry import execute_tool


from backend.services import dataset_service as ds


def route_tool(intent: str, dataset_id: str, columns: list, extra: dict | None = None) -> Dict[str, Any]:
    extra = extra or {}
    tool_name = INTENT_TO_TOOL.get(intent, "custom_sandbox")
    if tool_name == "custom_sandbox":
        return {"requires_custom_code": True, "intent": intent}
    kwargs: Dict[str, Any] = {}
    if intent == "feature_importance" and not columns:
        try:
            return execute_tool("run_feature_discovery", dataset_id)
        except Exception as exc:
            return {"error": str(exc), "status": "error"}
    if intent == "missing_value_analysis":
        kwargs["apply_cleaning"] = bool(extra.get("apply_cleaning", False))
    if tool_name == "run_bivariate_analysis":
        if len(columns) >= 2:
            kwargs = {"col_a": columns[0], "col_b": columns[1]}
        elif len(columns) == 1:
            sess = ds.get_dataset(dataset_id)
            if sess and sess.df is not None:
                candidates = [c for c in sess.df.columns if c != columns[0]]
                col_b = candidates[0] if candidates else columns[0]
                kwargs = {"col_a": columns[0], "col_b": col_b}
            else:
                kwargs = {"col_a": columns[0], "col_b": columns[0]}
        else:
            sess = ds.get_dataset(dataset_id)
            if sess and sess.df is not None and len(sess.df.columns) >= 2:
                kwargs = {"col_a": sess.df.columns[0], "col_b": sess.df.columns[1]}
    elif tool_name == "run_univariate_analysis":
        kwargs = {"columns": columns or extra.get("columns", [])}
    elif tool_name == "run_feature_importance" and columns:
        kwargs = {"target": columns[0]}
    elif tool_name == "run_multivariate_analysis" and columns:
        kwargs = {"target": columns[0]}
    elif tool_name == "run_correlation_analysis":
        kwargs = {"top_n": extra.get("top_n", 10)}
        if columns:
            kwargs["target_column"] = columns[0]
            if len(columns) >= 2:
                kwargs["columns"] = columns[:2]

    try:
        return execute_tool(tool_name, dataset_id, **kwargs)
    except Exception as exc:
        return {"error": str(exc), "status": "error"}
