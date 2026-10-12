"""
Result validation layer — validates tool/sandbox outputs per spec section 8.
Ensures: columns exist, dtypes appropriate, calculations succeeded, values serializable,
no NaN/Infinity exposed accidentally, schema valid.
"""
from __future__ import annotations
import math
from typing import Any, Dict, List, Optional

from backend.models.analysis import AnalysisResult


def _is_serializable(obj: Any) -> bool:
    """Check that obj can be JSON-serialized."""
    try:
        import json
        json.dumps(obj)
        return True
    except (TypeError, ValueError):
        return False


def _sanitize_value(val: Any) -> Any:
    """Convert NaN/Infinity to None for JSON safety."""
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
    return val


def _sanitize_any(obj):
    if isinstance(obj, float):
        return _sanitize_value(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_any(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_any(x) for x in obj]
    try:
        import numpy as np
        if isinstance(obj, (np.floating,)):
            import math
            f = float(obj)
            if math.isnan(f) or math.isinf(f):
                return None
            return f
        if isinstance(obj, (np.integer,)):
            return int(obj)
    except Exception:
        pass
    return obj


def _sanitize_dict(d: dict) -> dict:
    """Recursively sanitize NaN/Infinity from dict values."""
    return _sanitize_any(d)


def _sanitize_list(lst: list) -> list:
    return _sanitize_any(lst)


def validate_columns(df_columns: List[str], requested_columns: List[str]) -> List[str]:
    """Validate that requested columns exist in dataset."""
    missing = [c for c in requested_columns if c not in df_columns]
    if missing:
        return f"Unknown columns: {missing}"
    return None


def validate_result(result: dict, df_columns: Optional[List[str]] = None) -> tuple[bool, List[str]]:
    """
    Validate an analysis result dict against the contract (spec section 457-459).
    Returns (is_valid, list_of_issues).
    """
    issues = []

    # Required fields
    for field in ["analysis_id", "analysis_type", "title", "statistics"]:
        if field not in result:
            issues.append(f"Missing required field: {field}")

    # Validate columns exist
    if df_columns and "columns" in result:
        for col in result.get("columns", []):
            if col and col not in df_columns:
                issues.append(f"Requested column not in dataset: {col}")

    # Sanitize NaN/Infinity everywhere
    for _f in ("statistics", "visualization", "visualization_plan", "insights", "warnings", "issues", "operations", "before_after", "cleaned_health"):
        if _f in result:
            try:
                result[_f] = _sanitize_any(result[_f])
            except Exception:
                pass

    # Check serializability
    for field in ["statistics", "visualization", "visualization_plan", "insights", "warnings"]:
        if field in result:
            try:
                import json
                json.dumps(result[field])
            except (TypeError, ValueError) as e:
                issues.append(f"Field '{field}' is not JSON serializable: {e}")
                result[field] = str(result[field]) if not isinstance(result[field], (list, dict)) else []

    is_valid = len(issues) == 0
    return is_valid, issues


def validate_sandbox_result(sb_result) -> tuple[bool, List[str]]:
    """Validate a SandboxResult object."""
    issues = []
    if sb_result.status == "success":
        # Statistics must be serializable
        if sb_result.statistics:
            try:
                import json
                json.dumps(sb_result.statistics)
            except (TypeError, ValueError):
                issues.append("Sandbox statistics not serializable")
                sb_result.statistics = {}

    return sb_result.status == "success" and len(issues) == 0, issues
