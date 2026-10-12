from __future__ import annotations

import logging

from backend.tools.registry import execute_tool
from backend.analysis.options import validate_options

log = logging.getLogger(__name__)


def run_analysis(dataset_id: str, analysis_type: str, columns=None, params=None):
    params = params or {}
    mapping = {
        "health": "analyze_dataset_health",
        "univariate": "run_univariate_analysis",
        "bivariate": "run_bivariate_analysis",
        "correlation": "run_correlation_analysis",
        "multivariate": "run_multivariate_analysis",
        "feature_discovery": "run_feature_discovery",
        "feature_importance": "run_feature_importance",
        "overview": "generate_dataset_summary",
        "cleaning": "clean_dataset",
    }
    tool = mapping.get(analysis_type)
    if tool is None:
        raise ValueError(f"Unknown analysis_type: {analysis_type}")
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError("Dataset is no longer loaded. Upload it again.")
    frame = session.cleaned_df if session.cleaned_df is not None else session.df
    if columns and any(c not in frame.columns for c in columns):
        raise ValueError("One or more selected columns are not in the current dataset.")
    if analysis_type == "bivariate" and (not columns or len(columns) != 2 or columns[0] == columns[1]):
        raise ValueError("Select two different columns for bivariate analysis.")
    kwargs = validate_options(analysis_type, params)
    if columns:
        if tool == "run_bivariate_analysis" and len(columns) >= 2:
            kwargs.update({"col_a": columns[0], "col_b": columns[1]})
        elif tool in ("run_univariate_analysis",):
            kwargs.update({"columns": columns})
        elif tool in ("run_feature_importance", "run_multivariate_analysis"):
            kwargs.update({"target": columns[0]})
    result = execute_tool(tool, dataset_id, **kwargs)
    if result.get("error"):
        raise ValueError(result["error"])
    result["analysis_options"] = {k: v for k, v in kwargs.items() if k not in {"columns", "col_a", "col_b"}}

    # Every analysis gets the same AI narrative treatment the dataset gets after
    # upload, and so does every graph inside it. Attaching it here rather than
    # inside each tool means univariate, bivariate, correlation, multivariate,
    # importance, health and cleaning all gain it from one place — and every
    # figure narrated was already computed above, so the model is never the
    # source of a number.
    try:
        from backend.services.narration import attach_narratives
        attach_narratives(result, session)
    except Exception:  # noqa: BLE001 — a missing narrative must not fail the analysis
        log.exception("Narration failed for %s", analysis_type)

    if session is not None:
        session.analysis_history.append(result)
    return result
