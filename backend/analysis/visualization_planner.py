"""Safe, data-aware presentation planning for analysis results.

The analysis adapters own the numbers and choose a mathematically valid chart
family from the actual column roles. This module adds a second layer: it can ask
the configured LLM how to present that already-computed picture, but only inside
a small validated contract. The model cannot create values, change an axis, or
turn a categorical field into a fake numeric plot.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from backend.analysis.column_types import logical_type

log = logging.getLogger(__name__)

_SUPPORTED_TYPES = {"histogram", "bar", "line", "scatter", "heatmap", "clusters", "hbar", "ranking"}
_MAX_TITLE = 100
_MAX_TEXT = 240


def _enabled() -> bool:
    return os.getenv("ARGUS_CHART_AI", "on").strip().lower() not in {"off", "0", "false", "no"}


def _actual_charts(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the chart slots the existing frontend will actually render."""
    visualization = result.get("visualization")
    if isinstance(visualization, dict) and visualization.get("type") == "multi":
        return [chart for chart in visualization.get("charts", []) if isinstance(chart, dict)]
    if isinstance(visualization, dict) and visualization.get("type") in _SUPPORTED_TYPES:
        return [
            {
                "type": visualization.get("type"),
                "title": result.get("title") or "Analysis chart",
                **(visualization.get("data") or {}),
            }
        ]

    stats = result.get("statistics") if isinstance(result.get("statistics"), dict) else {}
    if result.get("analysis_type") == "correlation" or stats.get("matrix") or stats.get("matrix_values"):
        return [{"type": "heatmap", "title": "Correlation heatmap"}]
    if result.get("analysis_type") in {"feature_discovery", "feature_importance"}:
        return [{"type": "hbar", "title": "Feature importance", "target": stats.get("target")}]
    return []


def _role_context(session, result: Dict[str, Any]) -> Dict[str, Any]:
    df = getattr(session, "df", None)
    if df is None:
        return {}
    columns = result.get("columns") or []
    return {
        "rows": int(len(df)),
        "columns": [
            {"name": str(col), "role": logical_type(df[col]), "dtype": str(df[col].dtype)}
            for col in columns
            if col in df.columns
        ],
    }


def _reason(chart: Dict[str, Any]) -> str:
    kind = str(chart.get("type") or "chart")
    x_label = chart.get("xLabel") or chart.get("column") or "the selected variable"
    y_label = chart.get("yLabel") or "the measured value"
    reasons = {
        "histogram": f"A histogram preserves the distribution shape of {x_label} and makes spread and tails visible.",
        "bar": f"A bar chart compares the observed groups or levels of {x_label} without inventing an order.",
        "line": f"A line chart preserves the ordered time axis and shows how {y_label} changes across periods.",
        "scatter": f"A scatter plot keeps both numeric axes continuous so the relationship between {x_label} and {y_label} remains visible.",
        "heatmap": "A heatmap makes many pairwise association strengths comparable while keeping the matrix symmetric.",
        "hbar": "A horizontal ranking keeps long feature names readable and makes relative importance easy to compare.",
        "ranking": "A horizontal ranking makes the strongest model drivers visible from top to bottom.",
        "clusters": "A two-dimensional component map shows how records group after the computed dimensionality reduction.",
    }
    return reasons.get(kind, "The selected chart matches the data roles available in this result.")


def _deterministic_plan(result: Dict[str, Any], session) -> Dict[str, Any]:
    charts = _actual_charts(result)
    plan_charts: List[Dict[str, Any]] = []
    for index, chart in enumerate(charts):
        chart_type = str(chart.get("type") or "bar")
        if chart_type not in _SUPPORTED_TYPES:
            chart_type = "bar"
        title = str(chart.get("title") or result.get("title") or f"Chart {index + 1}")
        plan_charts.append({
            "id": f"chart-{index + 1}",
            "chart_type": chart_type,
            "title": title[:_MAX_TITLE],
            "x_label": str(chart.get("xLabel") or chart.get("column") or "")[:_MAX_TITLE],
            "y_label": str(chart.get("yLabel") or "")[:_MAX_TITLE],
            "reason": _reason(chart),
            "show_trendline": bool(chart.get("trend")) or chart_type == "scatter",
            "sort": "computed order",
        })

    return {
        "source": "deterministic",
        "analysis_type": str(result.get("analysis_type") or "analysis"),
        "charts": plan_charts,
        "note": "Chart values and chart family were selected from computed column roles; no model-generated numbers are used.",
        "data_context": _role_context(session, result),
    }


def _json_object(text: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", text or "", re.DOTALL)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except (TypeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _ai_overlay(result: Dict[str, Any], deterministic: Dict[str, Any], session) -> Optional[Dict[str, Any]]:
    if not _enabled():
        return None
    try:
        from backend.services.llm import chat_completion, is_configured

        if not is_configured() or not deterministic.get("charts"):
            return None
        allowed = [chart["chart_type"] for chart in deterministic["charts"]]
        prompt = {
            "analysis_type": result.get("analysis_type"),
            "result_title": result.get("title"),
            "columns": _role_context(session, result).get("columns", []),
            "charts_already_computed": deterministic["charts"],
            "allowed_chart_types": allowed,
        }
        response = chat_completion(
            "Choose the clearest presentation for these already-computed charts. "
            "Do not change chart_type, values, columns, axes, or statistics. Return JSON only with "
            "{\"charts\":[{\"id\":\"chart-1\",\"title\":\"...\","
            "\"emphasis\":\"...\",\"sort\":\"...\",\"show_trendline\":true}]}\n"
            + json.dumps(prompt, default=str),
            system_prompt=(
                "You are a visualization editor. You may improve labels, emphasis and ordering guidance, "
                "but you must preserve the validated chart type and computed data. Use short plain text."
            ),
            max_tokens=420,
            temperature=0.1,
            total_budget=5,
        )
        parsed = _json_object(response)
        if not parsed or not isinstance(parsed.get("charts"), list):
            return None

        by_id = {chart["id"]: chart for chart in deterministic["charts"]}
        merged: List[Dict[str, Any]] = []
        for suggestion in parsed["charts"]:
            if not isinstance(suggestion, dict):
                continue
            base = by_id.get(str(suggestion.get("id")))
            if not base:
                continue
            item = dict(base)
            # Never accept a model-supplied chart type. The adapter's type is the
            # only type the renderer is allowed to use.
            for key in ("title", "emphasis", "sort"):
                value = suggestion.get(key)
                if isinstance(value, str) and value.strip():
                    item[key] = value.strip()[:_MAX_TEXT if key == "emphasis" else _MAX_TITLE]
            if isinstance(suggestion.get("show_trendline"), bool):
                item["show_trendline"] = suggestion["show_trendline"]
            merged.append(item)

        if not merged:
            return None
        known = {item["id"] for item in merged}
        merged.extend(chart for chart in deterministic["charts"] if chart["id"] not in known)
        return {"source": "ai", "charts": merged, "note": deterministic["note"]}
    except Exception:  # noqa: BLE001 — presentation advice must never break analysis
        log.debug("AI visualization planning unavailable", exc_info=True)
        return None


def attach_visualization_plan(result: Dict[str, Any], session=None) -> Dict[str, Any]:
    """Attach a validated presentation plan without changing analysis values."""
    if not isinstance(result, dict) or result.get("error") or result.get("analysis_type") == "error":
        return result
    deterministic = _deterministic_plan(result, session)
    ai = _ai_overlay(result, deterministic, session)
    result["visualization_plan"] = ai or deterministic
    return result
