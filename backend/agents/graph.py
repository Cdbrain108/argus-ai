"""
LangGraph Multi-Agent Architecture for ARGUS.

Defines a clean, modular StateGraph for data analysis:
- planner: Understands question, resolves columns, selects intent
- conversational: Handles meta inquiries (creator, identity, greetings, guardrails)
- canned_tool: Runs fast deterministic EDA primitives
- sandbox_code: Generates and executes sandboxed pandas code
- self_correct: Reflects errors and retries sandbox code execution
- explainer: Produces executive plain-English synthesis
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, TypedDict

import numpy as np
import pandas as pd
from langgraph.graph import StateGraph, START, END

from backend.agents.planner import Planner, INTENT_TO_TOOL
from backend.agents.tool_router import route_tool
from backend.analysis.schemas import validate_result
from backend.sandbox.runner import run_sandboxed_analysis
from backend.services import dataset_service as ds
from backend.services import session_service as ss
from backend.services.llm import (
    LLMUnavailable,
    chat_completion,
    codegen_timeout,
    is_configured,
)


class AnalystState(TypedDict, total=False):
    # Context
    dataset_id: str
    message: str
    history: List[Dict[str, Any]]
    session_id: str
    profile: Dict[str, Any]
    df: Any
    
    # Planner outputs
    intent: str
    confidence: float
    columns: List[str]
    status_steps: List[str]
    
    # Execution outputs
    code: str
    analysis: Optional[Dict[str, Any]]
    reply: str
    error: Optional[str]
    retry_count: int
    requires_custom_code: bool


# ── NODE 1: PLANNER ───────────────────────────────────────────────────────────
def planner_node(state: AnalystState) -> Dict[str, Any]:
    """Understands query intent, extracts columns, and plans execution."""
    profile = state["profile"]
    planner = Planner(profile)
    message = state["message"]
    history = state.get("history", [])

    col_info = planner.resolve_columns(message, history)
    columns = col_info.get("columns", [])
    intent_info = planner.classify_intent(message, history, columns)
    intent = intent_info.get("intent", "custom")
    confidence = intent_info.get("confidence", 0.8)

    steps = [
        "Understanding your question",
        "Identifying relevant variables",
        f"Selecting {intent.replace('_', ' ')}",
    ]

    return {
        "intent": intent,
        "confidence": confidence,
        "columns": columns,
        "status_steps": steps,
        "retry_count": 0,
    }


# ── NODE 2: CONVERSATIONAL (META & GUARDRAILS) ─────────────────────────────────
def conversational_node(state: AnalystState) -> Dict[str, Any]:
    """Handles creator, project purpose, greetings, suggestions, and domain guardrails."""
    intent = state.get("intent")
    message = state.get("message", "")
    profile = state.get("profile", {})
    low = message.lower().strip()

    if intent == "meta_identity":
        if any(w in low for w in ("who made", "who created", "who built", "who designed", "who developed", "author", "creator", "who wrote")):
            reply = (
                "**ARGUS** was designed and developed by **Anuj Kesharwani** as an AI-powered Automated "
                "Exploratory Data Analysis & Intelligent Analytics Platform."
            )
        elif any(w in low for w in ("what is this project", "what is argus", "purpose", "what does this project do", "what is this for", "what can you do")):
            reply = (
                "**ARGUS** is an AI-powered Automated Exploratory Data Analysis (EDA) platform. "
                "It is built to help data scientists and analysts instantly profile raw datasets, uncover data hygiene issues "
                "and missing values, compute statistical correlations, rank predictive feature drivers, execute dynamic "
                "computational queries in a safe Python sandbox, and provide grounded plain-English explanations for every pattern and graph."
            )
        elif any(w in low for w in ("who are you", "what are you", "your name")):
            reply = (
                "I am **ARGUS**, your AI Data Analyst companion! I'm equipped with automated statistical engines "
                "and a Python computational sandbox to help you analyze, visualize, and extract deep insights from your dataset."
            )
        elif any(w in low for w in ("how are you", "how're you", "how are you doing")):
            reply = (
                "I'm doing great and ready to analyze your data! What patterns, distributions, or hypotheses "
                "would you like to investigate today?"
            )
        else:
            reply = "Hello! I am **ARGUS**, your AI Data Analyst companion. What would you like to explore in this dataset?"
        steps = ["Understanding your message", "Connecting with AI Analyst", "Responding"]

    elif intent == "dataset_suggestions":
        numeric = profile.get("numeric_columns", [])
        cats = profile.get("categorical_columns", [])
        target = profile.get("target_variable")

        lines = ["Here are high-impact analytical questions you can ask me about this dataset:\n"]
        if numeric:
            lines.append(f"• **Distribution & Outliers**: *'Show the distribution and outlier fences for `{numeric[0]}`'*")
        if len(numeric) >= 2:
            lines.append(f"• **Correlation & Trend**: *'What is the correlation between `{numeric[0]}` and `{numeric[1]}`?'*")
        if numeric and cats:
            lines.append(f"• **Cohort Comparison**: *'Compare the average `{numeric[0]}` across `{cats[0]}` categories'*")
        if target:
            lines.append(f"• **Predictive Drivers**: *'What are the strongest predictive features for `{target}`?'*")
        if len(numeric) >= 2:
            lines.append(f"• **Custom Calculation**: *'Calculate the ratio of `{numeric[0]}` to `{numeric[1]}` and find the top 5 records'*")
        lines.append("• **Health Audit**: *'Scan dataset health and suggest data cleaning steps'*")
        lines.append("\nYou can also ask custom questions with formulas, conditions, or group-bys!")
        reply = "\n".join(lines)
        steps = ["Inspecting dataset schema", "Discovering key patterns", "Generating suggestions"]

    else:  # out_of_domain
        numeric = profile.get("numeric_columns", [])
        col_example = numeric[0] if numeric else "any column"
        reply = (
            "Sorry, I cannot help with that request! I am specialized in automated exploratory data analysis, "
            "statistics, and machine learning insights for your loaded dataset.\n\n"
            "Here are examples of what you can ask me about your data:\n"
            "• *'Give me an executive summary and health check of this dataset'*\n"
            f"• *'Show the distribution, spread, and outliers for `{col_example}`'*\n"
            "• *'What are the strongest correlations across features?'*\n"
            "• *'Which group or category has the highest average value?'*\n"
            "• *'Calculate [custom formula] and show the survival/conversion rate across groups'*\n"
            "• *'What data cleaning actions and missing value treatments do you recommend?'*"
        )
        steps = ["Analyzing inquiry scope", "Applying domain guardrails", "Preparing helpful guide"]

    return {
        "reply": reply,
        "analysis": None,
        "status_steps": steps,
        "requires_custom_code": False,
    }


# ── NODE 3: CANNED TOOL ───────────────────────────────────────────────────────
def canned_tool_node(state: AnalystState) -> Dict[str, Any]:
    """Executes deterministic EDA primitives (overview, distribution, correlations, health)."""
    intent = state["intent"]
    dataset_id = state["dataset_id"]
    columns = list(state.get("columns", []))
    profile = state["profile"]

    # Ensure robust column candidates for canned statistical tools
    if intent == "relationship_analysis" and len(columns) < 2:
        target = profile.get("target_variable")
        numeric = profile.get("numeric_columns", [])
        cats = profile.get("categorical_columns", [])
        all_cols = [c.get("name", "") for c in profile.get("column_summary", []) if c.get("name")]
        pool = ([target] if target else []) + numeric + cats + all_cols
        for c in pool:
            if c and c not in columns:
                columns.append(c)
            if len(columns) >= 2:
                break
    elif intent == "distribution_analysis" and not columns:
        target = profile.get("target_variable")
        numeric = profile.get("numeric_columns", [])
        cats = profile.get("categorical_columns", [])
        all_cols = [c.get("name", "") for c in profile.get("column_summary", []) if c.get("name")]
        pool = ([target] if target else []) + numeric + cats + all_cols
        for c in pool:
            if c:
                columns.append(c)
                break

    tool_out = route_tool(intent, dataset_id, columns, {"profile": profile, "apply_cleaning": intent == "data_cleaning"})
    if tool_out.get("error"):
        tool_out = route_tool("summary_overview", dataset_id, [], {"profile": profile})

    df = state["df"]
    valid, issues = validate_result(tool_out, list(df.columns))
    if not valid:
        tool_out.setdefault("warnings", []).extend(issues)

    steps = list(state.get("status_steps", [])) + ["Executing statistical engine", "Validating outputs"]
    return {
        "analysis": tool_out,
        "status_steps": steps,
        "requires_custom_code": False,
    }


# ── HELPER: DETERMINISTIC MULTIVARIATE & MULTI-FEATURE FALLBACK ──────────────
def _generate_multivariate_fallback(df: Any, columns: List[str], question: str) -> Optional[Dict[str, Any]]:
    """Generates an accurate multi-variable breakdown and chart when custom code generation fails or is unconfigured."""
    if not isinstance(df, pd.DataFrame) or df.empty:
        return None

    valid_cols = [c for c in columns if c in df.columns]
    if len(valid_cols) < 2:
        return None

    # Separate numeric vs categorical/discrete columns
    num_cols = [c for c in valid_cols if pd.api.types.is_numeric_dtype(df[c]) and df[c].nunique() > 4]
    cat_cols = [c for c in valid_cols if c not in num_cols]

    clean_df = df.dropna(subset=valid_cols)
    if clean_df.empty:
        clean_df = df[valid_cols].copy()

    # Case 1: At least 1 numeric column and categorical/discrete columns
    if num_cols and cat_cols:
        target_num = num_cols[0]
        group_cats = cat_cols[:2]
        # Order categories: higher cardinality dimension as primary X-group, lower cardinality as sub-bars
        if len(group_cats) == 2:
            c0, c1 = group_cats[0], group_cats[1]
            if clean_df[c0].nunique() < clean_df[c1].nunique():
                group_cats = [c1, c0]

        # Dynamic Aggregation Metric Extraction from user question
        q_low = question.lower()
        if any(w in q_low for w in ("median", "p50", "50th percentile", "middle")):
            agg_key = "median"
            agg_label = "Median"
        elif any(w in q_low for w in ("sum", "total", "aggregate", "combined")):
            agg_key = "sum"
            agg_label = "Total"
        elif any(w in q_low for w in ("min", "minimum", "lowest", "youngest", "cheapest")):
            agg_key = "min"
            agg_label = "Minimum"
        elif any(w in q_low for w in ("max", "maximum", "highest", "oldest", "expensive", "peak")):
            agg_key = "max"
            agg_label = "Maximum"
        elif any(w in q_low for w in ("count", "frequency", "volume", "how many")):
            agg_key = "count"
            agg_label = "Count"
        elif any(w in q_low for w in ("std", "standard deviation", "spread", "variance")):
            agg_key = "std"
            agg_label = "Std Dev"
        else:
            agg_key = "mean"
            agg_label = "Mean"

        # Semantic Column Domain & Unit Detection (Agnostic across any dataset)
        target_low = target_num.lower()
        is_currency = bool(re.search(r"\b(fare|price|cost|salary|revenue|income|spend|budget|fee|amount|usd|eur|gbp|inr)\b", target_low))
        is_age = bool(re.search(r"\b(age|tenure|duration|experience|years|yrs)\b", target_low))
        is_pct = bool(re.search(r"\b(rate|ratio|pct|percent|proportion|share)\b", target_low))

        unit = "$" if is_currency else ("yrs" if is_age else ("%" if is_pct else ""))

        def _fmt_stat(val: float) -> str:
            if is_currency:
                return f"${val:,.2f}"
            if is_age:
                return f"{val:.1f}" if val % 1 != 0 else f"{int(val)}"
            if is_pct:
                return f"{val:.1f}%"
            return f"{val:,.2f}".rstrip("0").rstrip(".") if val % 1 != 0 else f"{int(val):,}"

        grouped = clean_df.groupby(group_cats)[target_num].agg(["mean", "median", "count", "min", "max"]).round(2).reset_index()

        def _fmt_val(col: str, val: Any) -> str:
            if isinstance(val, (bool, np.bool_)):
                return "True" if val else "False"
            s = str(val).strip()
            if re.match(r"^\d+\.0$", s):
                s = s[:-2]
            return s.capitalize() if s.isalpha() else s

        labels = []
        stats = {}
        for _, row in grouped.iterrows():
            cohort_name = " - ".join([_fmt_val(c, row[c]) for c in group_cats])
            labels.append(cohort_name)
            stats[cohort_name] = {
                f"{agg_label} {target_num}": round(float(row[agg_key]), 2),
                f"Mean {target_num}": round(float(row["mean"]), 2),
                f"Median {target_num}": round(float(row["median"]), 2),
                "Record Count": int(row["count"]),
            }

        chart_data_vals = [round(float(row[agg_key]), 2) for _, row in grouped.iterrows()]

        insights = []
        if len(grouped) >= 2:
            max_idx = grouped[agg_key].idxmax()
            min_idx = grouped[agg_key].idxmin()
            max_row = grouped.loc[max_idx]
            min_row = grouped.loc[min_idx]
            max_cohort = " - ".join([_fmt_val(c, max_row[c]) for c in group_cats])
            min_cohort = " - ".join([_fmt_val(c, min_row[c]) for c in group_cats])
            insights.append(
                f"The highest {agg_label.lower()} {target_num} is in '{max_cohort}' ({_fmt_stat(max_row[agg_key])}), "
                f"while the lowest is in '{min_cohort}' ({_fmt_stat(min_row[agg_key])})."
            )

        insights.append(
            f"Segmented across {len(grouped)} distinct cohort combinations covering {int(len(clean_df)):,} records."
        )

        # Build grouped structure for side-by-side visualization
        primary_cat = group_cats[0]
        secondary_cat = group_cats[1] if len(group_cats) > 1 else None

        groups_map = {}
        for _, row in grouped.iterrows():
            g_name = _fmt_val(primary_cat, row[primary_cat])
            sub_lbl = _fmt_val(secondary_cat, row[secondary_cat]) if secondary_cat else "Metric"
            val = round(float(row[agg_key]), 2)
            if g_name not in groups_map:
                groups_map[g_name] = []
            groups_map[g_name].append({
                "label": sub_lbl,
                "value": val,
                "count": int(row["count"]),
                "median": round(float(row["median"]), 2),
                "mean": round(float(row["mean"]), 2),
            })

        groups_list = [{"name": k, "bars": v} for k, v in groups_map.items()]

        series_names = list(dict.fromkeys(
            bar["label"] for g in groups_list for bar in g["bars"]
        ))
        palette = ["#38bdf8", "#818cf8", "#34d399", "#f59e0b", "#ec4899", "#f87171", "#a78bfa"]
        series_list = []
        for idx, s in enumerate(series_names):
            series_list.append({"name": s, "color": palette[idx % len(palette)]})

        chart = {
            "type": "grouped_bar",
            "data": {
                "title": f"{agg_label} {target_num} by {primary_cat} & {secondary_cat or ''}".strip(),
                "xLabel": primary_cat,
                "yLabel": f"{agg_label} {target_num} ({unit})" if unit else f"{agg_label} {target_num}",
                "unit": unit,
                "metricLabel": f"{agg_label} {target_num}",
                "entityName": "records",
                "groups": groups_list,
                "series": series_list,
                "labels": labels,
                "data": chart_data_vals,
                "values": chart_data_vals,
            },
        }

        title = f"Multivariate Breakdown: {target_num} by {' & '.join(group_cats)}"
        return {
            "analysis_name": title,
            "statistics": stats,
            "insights": insights,
            "chart": chart,
            "chart_type": "grouped_bar",
            "chart_data": chart["data"],
            "analysis_id": "custom",
            "analysis_type": "custom",
            "title": title,
            "visualization": chart,
        }

    # Case 2: All numeric columns (e.g. Fare, Age, SibSp)
    if len(num_cols) >= 2:
        x_col, y_col = num_cols[0], num_cols[1]
        sample = clean_df.dropna(subset=[x_col, y_col]).head(200)
        chart = {
            "type": "scatter",
            "data": {
                "x": [round(float(v), 2) for v in sample[x_col]],
                "y": [round(float(v), 2) for v in sample[y_col]],
                "xLabel": x_col,
                "yLabel": y_col,
            },
        }
        title = f"Multivariate Scatter: {x_col} vs {y_col}"
        corr = float(clean_df[x_col].corr(clean_df[y_col])) if len(clean_df) > 1 else 0.0
        return {
            "analysis_name": title,
            "statistics": {
                f"{x_col} Mean": round(float(clean_df[x_col].mean()), 2),
                f"{y_col} Mean": round(float(clean_df[y_col].mean()), 2),
                "Correlation": round(corr, 3),
            },
            "insights": [
                f"Analyzed {len(valid_cols)} numeric variables: {', '.join(valid_cols)}.",
                f"Correlation between {x_col} and {y_col} is {corr:.3f}.",
            ],
            "chart": chart,
            "chart_type": "scatter",
            "chart_data": chart["data"],
            "analysis_id": "custom",
            "analysis_type": "custom",
            "title": title,
            "visualization": chart,
        }

    # Case 3: Categorical combinations
    top_cats = cat_cols[:3]
    grouped = clean_df.groupby(top_cats).size().reset_index(name="Count")
    labels = [" - ".join([str(row[c]) for c in top_cats]) for _, row in grouped.head(15).iterrows()]
    counts = [int(row["Count"]) for _, row in grouped.head(15).iterrows()]
    chart = {
        "type": "bar",
        "data": {
            "labels": labels,
            "data": counts,
            "values": counts,
            "xLabel": " - ".join(top_cats),
            "yLabel": "Record Count",
        },
    }
    title = f"Multi-Variable Cross-Tabulation: {' x '.join(top_cats)}"
    return {
        "analysis_name": title,
        "statistics": {lbl: cnt for lbl, cnt in zip(labels, counts)},
        "insights": [f"Evaluated cross-tabulation across {len(labels)} distinct category combinations."],
        "chart": chart,
        "chart_type": "bar",
        "chart_data": chart["data"],
        "analysis_id": "custom",
        "analysis_type": "custom",
        "title": title,
        "visualization": chart,
    }


def _format_chart_from_result(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Formats and structures raw sandbox output into clean grouped or single-dimension visualizations."""
    chart = result.get("chart")
    if not chart and result.get("chart_type") and result.get("chart_data"):
        chart = {
            "type": result.get("chart_type"),
            "data": result.get("chart_data"),
        }

    stats = result.get("statistics") or {}
    if not chart and isinstance(stats, dict) and 2 <= len(stats) <= 25:
        items = []
        for k, v in stats.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                # Filter out grand overall mean from side-by-side comparison
                if re.search(r"^(mean|avg|fare)?_?overall", str(k), re.I):
                    continue
                items.append((str(k), float(v)))

        # Try to parse into side-by-side grouped categories
        grouped_map = {}
        all_subs = set()
        for k_str, val in items:
            cleaned = re.sub(r"^((mean|avg|median|sum|count|fare)_+)+", "", k_str, flags=re.I)
            parts = re.split(r"\s*-\s*|\s*·\s*|\s*/\s*|_", cleaned)
            parts = [p.strip() for p in parts if p.strip()]
            if len(parts) >= 2:
                p0 = parts[0]
                p1 = " ".join(parts[1:])
                g_name = p0.capitalize() if p0.isalpha() else p0
                sub = p1.capitalize() if p1.isalpha() else p1

                if g_name not in grouped_map:
                    grouped_map[g_name] = []
                grouped_map[g_name].append({"label": sub, "value": val})
                all_subs.add(sub)

        if len(grouped_map) >= 2 and all(len(bars) >= 1 for bars in grouped_map.values()):
            groups_list = [{"name": k, "bars": v} for k, v in grouped_map.items()]
            palette = ["#38bdf8", "#818cf8", "#34d399", "#f59e0b", "#ec4899", "#f87171", "#a78bfa"]
            series_list = []
            for idx, s in enumerate(sorted(all_subs)):
                series_list.append({"name": s, "color": palette[idx % len(palette)]})
            chart = {
                "type": "grouped_bar",
                "data": {
                    "title": result.get("analysis_name") or "Multivariate Comparison",
                    "xLabel": "Cohort",
                    "yLabel": result.get("analysis_name") or "Value",
                    "groups": groups_list,
                    "series": series_list,
                },
            }
        elif items:
            clean_labels = [
                re.sub(r"^(mean|avg|median|sum|count|fare)_+", "", k, flags=re.I).replace("_", " ").title()
                for k, _ in items
            ]
            chart = {
                "type": "bar",
                "data": {
                    "labels": clean_labels,
                    "data": [v for _, v in items],
                    "values": [v for _, v in items],
                    "xLabel": "Group",
                    "yLabel": result.get("analysis_name") or "Value",
                },
            }

    if chart:
        result["chart"] = chart
    return chart


# ── NODE 4: SANDBOX CODE EXECUTION ───────────────────────────────────────────
def sandbox_code_node(state: AnalystState) -> Dict[str, Any]:
    """Generates and executes dynamic Python/pandas code in the AST-gated sandbox."""
    df = state["df"]
    question = state["message"]
    history = state.get("history", [])
    columns = list(state.get("columns", []))

    def _run_multivariate_fallback():
        fallback_res = _generate_multivariate_fallback(df, columns, question)
        if fallback_res:
            steps = list(state.get("status_steps", [])) + [
                "Executing dynamic multivariate grouping",
                "Generating multi-feature visualization",
            ]
            return {
                "code": "# Computed via dynamic multivariate aggregation engine",
                "analysis": fallback_res,
                "error": None,
                "status_steps": steps,
                "requires_custom_code": True,
            }
        return None

    if not is_configured():
        fallback = _run_multivariate_fallback()
        if fallback:
            return fallback
        return {
            "error": "No LLM API key configured",
            "reply": "No AI provider configured for custom queries.",
            "requires_custom_code": True,
        }

    # Build schema and sample value context for the code generation prompt
    target_cols = [c for c in columns if c in df.columns] if columns else list(df.columns[:5])
    col_details = []
    for c in target_cols[:6]:
        dtype = str(df[c].dtype)
        # Check if boolean or low-cardinality discrete column to expose exact values
        if pd.api.types.is_bool_dtype(df[c]) or df[c].dtype == "boolean" or df[c].nunique() <= 6:
            top_vals = [
                bool(x) if isinstance(x, (bool, np.bool_)) else (round(float(x), 2) if isinstance(x, (int, float)) else str(x))
                for x in df[c].dropna().unique()[:6]
            ]
            col_details.append(f"- `{c}` ({dtype}): distinct={df[c].nunique()}, values={top_vals}")
        elif pd.api.types.is_numeric_dtype(df[c]):
            non_null = df[c].dropna()
            if not non_null.empty:
                col_details.append(f"- `{c}` ({dtype}): min={non_null.min():.2f}, max={non_null.max():.2f}, unique_values={df[c].nunique()}")
            else:
                col_details.append(f"- `{c}` ({dtype})")
        else:
            top_vals = [str(x) for x in df[c].dropna().unique()[:5]]
            col_details.append(f"- `{c}` ({dtype}): distinct={df[c].nunique()}, samples={top_vals}")
    schema_block = "\n".join(col_details)

    # Format recent conversation history so multi-turn references are fully understood
    history_lines = []
    if history:
        for turn in history[-6:]:
            r = turn.get("role", "user")
            c = (turn.get("content") or "").strip()
            if c:
                history_lines.append(f"{r.capitalize()}: {c[:220]}")
    history_ctx = ("\nRecent Conversation History:\n" + "\n".join(history_lines) + "\n\n") if history_lines else ""

    prompt = (
        f"You are an expert Python data analyst and data engineer. Write safe, production-grade pandas/numpy code to execute the user's request on `df`:\n"
        f"Request: \"{question}\"\n\n"
        f"{history_ctx}"
        f"Columns and Schema:\n{schema_block}\n\n"
        f"All Columns: {list(df.columns)}\n\n"
        "Guidelines:\n"
        "1. Write pure pandas/numpy/scipy/sklearn code operating on `df`. No file or network I/O, no blocked builtins. Keep code concise.\n"
        "2. DATA TRANSFORMATIONS & CLEANING:\n"
        "   - If the user asks to clean, impute, transform, filter, create new columns, or mutate data:\n"
        "     Perform the transformation on `df` (e.g. `df['new_col'] = ...`, `df = df.dropna()`, `df['col'] = df['col'].fillna(...)`).\n"
        "     Assign `df` to `result['df'] = df` so the resultant transformed dataset is preserved and made available to the user!\n"
        "3. ANALYTICAL QUESTIONS & VISUALIZATIONS:\n"
        "   - Pay strict attention to the requested metric/aggregation (median, mean, sum, count, etc.).\n"
        "   - Choose the statistically best visualization for the data shape:\n"
        "     * 2 Categorical / Discrete columns + 1 Numeric metric: Use 'grouped_bar' with groups: [{'name': <Category1>, 'bars': [{'label': <Category2>, 'value': <num>}]}] and series: [{'name': <Category2>, 'color': <hex>}].\n"
        "     * 1 Categorical column + 1 Numeric metric: Use 'bar': {'labels': [...], 'values': [...], 'xLabel': ..., 'yLabel': ...}.\n"
        "     * 2 Continuous Numeric variables: Use 'scatter': {'x': [...], 'y': [...], 'categories': [...], 'xLabel': ..., 'yLabel': ...}.\n"
        "     * Distribution spreads/quartiles across groups: Use 'box_plot': {'groups': [{'name': ..., 'boxes': [{'label': ..., 'min': ..., 'q25': ..., 'median': ..., 'q75': ..., 'max': ...}]}]}.\n"
        "     * Time series / sequential: Use 'line'.\n"
        "4. Output format:\n"
        "   Assign a dictionary named `result` with keys:\n"
        "   - 'analysis_name': Descriptive, executive title matching the exact analytical or transformation goal\n"
        "   - 'statistics': Dictionary with human-readable keys and clean numeric values (never raw code variable names)\n"
        "   - 'insights': List of 2 to 3 concise, informative analytical findings or transformation summaries\n"
        "   - 'chart_type': 'grouped_bar', 'box_plot', 'scatter', 'bar', 'line', or None (if pure transformation/cleaning)\n"
        "   - 'chart_data': Dictionary matching chart_type, or {} if none\n"
        "   - 'df': The transformed dataframe (if data was cleaned, mutated, filtered, or new columns were created)\n\n"
        "Return valid JSON only with one key 'code'."
    )

    try:
        raw = chat_completion(
            prompt,
            system_prompt="You are an expert Python data analyst who writes clean, safe pandas analyses and structures rich visualization data. Return valid JSON only with one key 'code'.",
            max_tokens=2048,
            temperature=0,
            timeout=codegen_timeout(),
        )
        code = ""
        # Tier 1: Check for fenced code block (```python ... ```)
        cb_match = re.search(r"```(?:python)?\s*\n(.*?)```", raw, re.DOTALL)
        if cb_match:
            candidate = cb_match.group(1).strip()
            if candidate.startswith("{") and candidate.endswith("}"):
                try:
                    p = json.loads(candidate)
                    if isinstance(p, dict) and "code" in p:
                        candidate = p["code"]
                except Exception:
                    pass
            code = candidate

        # Tier 2: Check for JSON object {"code": "..."}
        if not code:
            json_match = re.search(r"\{[\s\S]*\}", raw)
            if json_match:
                try:
                    payload = json.loads(json_match.group(0))
                    if isinstance(payload, dict):
                        code = payload.get("code", "")
                except Exception:
                    pass

        # Tier 3: Check for directly runnable Python code
        if not code:
            lines = [l for l in raw.strip().splitlines() if not l.startswith("```")]
            candidate = "\n".join(lines).strip()
            if any(k in candidate for k in ("df[", "result =", "result=", "import ", "pd.", "np.")):
                code = candidate
    except Exception as exc:
        fallback = _run_multivariate_fallback()
        if fallback:
            return fallback
        return {"error": str(exc), "retry_count": state.get("retry_count", 0)}

    if not code.strip():
        fallback = _run_multivariate_fallback()
        if fallback:
            return fallback
        return {"error": "LLM returned empty code", "retry_count": state.get("retry_count", 0)}

    sandbox_result = run_sandboxed_analysis(code, df)
    result = sandbox_result.to_dict()

    if result.get("status") == "error":
        fallback = _run_multivariate_fallback()
        if fallback:
            return fallback
        return {
            "code": code,
            "error": str(result.get("message") or "Sandbox execution failed"),
            "retry_count": state.get("retry_count", 0),
        }

    # Sanity check: detect empty calculations (all None statistics or all 0 chart values due to indexing mismatch)
    stats = result.get("statistics") or {}
    all_stats_none = bool(stats) and all(
        v is None or (isinstance(v, float) and np.isnan(v)) for v in stats.values()
    )
    cd = result.get("chart_data") or {}
    cats = cd.get("categories") or []
    all_points_zero = bool(cats) and all(
        p.get("value", 0) == 0 for cat in cats for p in cat.get("points", [])
    )
    if all_stats_none or all_points_zero:
        fallback = _run_multivariate_fallback()
        if fallback:
            return fallback

    # Format chart visualization into clean grouped or single chart
    chart = _format_chart_from_result(result)

    # If dataset was transformed, mutated, cleaned, or new columns created, update dataset session!
    dataset_update = result.get("dataset_update")
    if dataset_update and sandbox_result.transformed_records:
        transformed_df = pd.DataFrame(sandbox_result.transformed_records)
        ds_id = state.get("dataset_id")
        if ds_id:
            update_info = ds.update_dataset_dataframe(ds_id, transformed_df)
            if update_info:
                result["dataset_update"] = update_info

    result.update({
        "analysis_id": "custom",
        "analysis_type": "custom",
        "title": result.get("analysis_name") or "Custom analysis",
        "visualization": chart,
    })

    steps = list(state.get("status_steps", [])) + ["Running Python code in sandbox", "Verifying calculations"]
    return {
        "code": code,
        "analysis": result,
        "error": None,
        "status_steps": steps,
        "requires_custom_code": True,
    }


# ── NODE 5: SELF-CORRECTION (AGENTIC RETRY) ──────────────────────────────────
def self_correction_node(state: AnalystState) -> Dict[str, Any]:
    """Reflects runtime errors back to LLM to self-correct and re-execute."""
    df = state["df"]
    question = state["message"]
    prev_code = state.get("code", "")
    prev_error = state.get("error", "Unknown error")

    fix_prompt = (
        f"The Python analysis code you generated previously failed with this error:\n"
        f"{prev_error}\n\n"
        f"Previous Code:\n{prev_code}\n\n"
        f"User Question: {question}\n"
        f"Available DataFrame Columns: {list(df.columns)}\n\n"
        f"Fix the bug and provide safe, clean pandas code. Assign `result` dictionary with keys "
        f"analysis_name, statistics, insights, and optionally chart_type ('bar', 'scatter', 'line') and chart_data."
    )

    try:
        raw_fix = chat_completion(
            fix_prompt,
            system_prompt="You fix pandas errors and write reliable, bug-free data analysis code. Return valid JSON only with one key 'code'.",
            max_tokens=1000,
            temperature=0,
            timeout=codegen_timeout(),
        )
        fix_code = ""
        cb_match = re.search(r"```(?:python)?\s*\n(.*?)```", raw_fix, re.DOTALL)
        if cb_match:
            candidate = cb_match.group(1).strip()
            if candidate.startswith("{") and candidate.endswith("}"):
                try:
                    p = json.loads(candidate)
                    if isinstance(p, dict) and "code" in p:
                        candidate = p["code"]
                except Exception:
                    pass
            fix_code = candidate

        if not fix_code:
            match_fix = re.search(r"\{[\s\S]*\}", raw_fix)
            if match_fix:
                try:
                    fix_payload = json.loads(match_fix.group(0))
                    if isinstance(fix_payload, dict):
                        fix_code = fix_payload.get("code", "")
                except Exception:
                    pass

        if not fix_code:
            lines = [l for l in raw_fix.strip().splitlines() if not l.startswith("```")]
            candidate = "\n".join(lines).strip()
            if any(k in candidate for k in ("df[", "result =", "result=", "import ", "pd.", "np.")):
                fix_code = candidate

        if fix_code.strip():
            fix_sandbox = run_sandboxed_analysis(fix_code, df)
            res = fix_sandbox.to_dict()
            if res.get("status") != "error":
                chart = _format_chart_from_result(res)
                res.update({
                    "analysis_id": "custom",
                    "analysis_type": "custom",
                    "title": res.get("analysis_name") or "Custom analysis",
                    "visualization": chart,
                })
                steps = list(state.get("status_steps", [])) + ["Corrected code automatically", "Verified calculations"]
                return {
                    "code": fix_code,
                    "analysis": res,
                    "error": None,
                    "retry_count": state.get("retry_count", 0) + 1,
                    "status_steps": steps,
                    "requires_custom_code": True,
                }
    except Exception:
        pass

    return {
        "retry_count": state.get("retry_count", 0) + 1,
        "error": prev_error,
        "requires_custom_code": True,
    }


# ── NODE 6: EXPLAINER ────────────────────────────────────────────────────────
def explainer_node(state: AnalystState) -> Dict[str, Any]:
    """Generates executive plain-English synthesis of the computed statistics."""
    analysis = state.get("analysis")
    question = state["message"]
    history = state.get("history", [])

    if state.get("error") and not analysis:
        reply = f"I generated an analysis for that question but encountered an error: {state['error']}. Try rephrasing or naming specific columns."
        steps = list(state.get("status_steps", [])) + ["Analysis incomplete"]
        return {"reply": reply, "status_steps": steps}

    if not analysis:
        return {"reply": state.get("reply", "Analysis completed.")}

    # Fast path: if verified analytical insights or summaries were already computed by
    # the Python sandbox or statistical engine, synthesize them directly without waiting
    # for a redundant 3-5s LLM network round-trip.
    raw_insights = analysis.get("insights") or []
    clean_insights = [str(i).strip() for i in raw_insights if str(i).strip()]
    title = analysis.get("title") or analysis.get("analysis_name") or "Statistical Analysis"
    if clean_insights and sum(len(i) for i in clean_insights) >= 20:
        if len(clean_insights) == 1:
            reply = f"**{title}**\n\n{clean_insights[0]}"
        else:
            bullets = "\n".join(f"• {item}" for item in clean_insights)
            reply = f"**{title}**\n\n{bullets}"
        analysis["explanation"] = reply
        steps = list(state.get("status_steps", [])) + ["Executive synthesis ready"]
        return {"reply": reply, "analysis": analysis, "status_steps": steps}

    if not is_configured():
        insights_str = "\n".join(f"• {i}" for i in clean_insights[:4]) if clean_insights else ""
        reply = f"**{title}**\n\n{insights_str}".strip() if insights_str else f"Analysis completed: **{title}**."
        analysis["explanation"] = reply
        steps = list(state.get("status_steps", [])) + ["Preparing executive explanation"]
        return {"reply": reply, "analysis": analysis, "status_steps": steps}

    prompt_focus = (
        "Explain what the computed numbers mean in 2 concise, highly informative sentences. "
        "Do not mention thinking steps. Start your response directly with the analytical finding."
    )
    context_block = ""
    if history:
        recent = [f"{m.get('role', 'user')}: {str(m.get('content', ''))[:160]}" for m in history[-3:] if m.get("content")]
        if recent:
            context_block = "Recent conversation context:\n" + "\n".join(recent) + "\n\n"

    # Lean payload for fast tokenization & lowest latency
    compact_summary = {
        "title": analysis.get("title") or analysis.get("analysis_name"),
        "statistics": analysis.get("statistics"),
        "insights": clean_insights,
        "summary": analysis.get("summary"),
    }

    try:
        reply = chat_completion(
            prompt=(
                f"{context_block}"
                f"Current user question: {question}\n"
                f"Computed analysis statistics: {json.dumps(compact_summary, default=str)}\n\n"
                f"{prompt_focus}"
            ),
            system_prompt=(
                "You are ARGUS, an expert senior AI data analyst. "
                "Provide a direct, authoritative, and plain-English answer based solely on the computed data. "
                "Never hallucinate numbers. Never say 'The user is asking' or 'Based on the prompt'."
            ),
            max_tokens=180,
            temperature=0.2,
            timeout=6.0,
        )
    except Exception:
        title = analysis.get("title") or analysis.get("analysis_name") or "Analysis"
        reply = f"Analysis completed: {title}."

    analysis["explanation"] = reply
    steps = list(state.get("status_steps", [])) + ["Preparing executive explanation"]
    return {
        "reply": reply,
        "analysis": analysis,
        "status_steps": steps,
    }


# ── CONDITIONAL ROUTING EDGES ────────────────────────────────────────────────
def route_after_planner(state: AnalystState) -> str:
    intent = state.get("intent", "custom")
    if intent in ("meta_identity", "dataset_suggestions", "out_of_domain"):
        return "conversational"
    if intent in (
        "summary_overview", "distribution_analysis", "relationship_analysis",
        "correlation_analysis", "feature_importance", "multivariate",
        "outlier_detection", "missing_value_analysis", "data_cleaning",
    ):
        return "canned_tool"
    return "sandbox_code"


def route_after_sandbox(state: AnalystState) -> str:
    if state.get("error") and state.get("retry_count", 0) < 1:
        return "self_correct"
    return "explainer"


# ── BUILD AND COMPILE THE LANGGRAPH STATEGRAPH ────────────────────────────────
def build_analyst_graph() -> Any:
    graph = StateGraph(AnalystState)

    # 1. Add nodes
    graph.add_node("planner", planner_node)
    graph.add_node("conversational", conversational_node)
    graph.add_node("canned_tool", canned_tool_node)
    graph.add_node("sandbox_code", sandbox_code_node)
    graph.add_node("self_correct", self_correction_node)
    graph.add_node("explainer", explainer_node)

    # 2. Add edges & conditional transitions
    graph.add_edge(START, "planner")
    graph.add_conditional_edges("planner", route_after_planner)
    graph.add_edge("conversational", END)
    graph.add_edge("canned_tool", "explainer")
    graph.add_conditional_edges("sandbox_code", route_after_sandbox)
    graph.add_edge("self_correct", "explainer")
    graph.add_edge("explainer", END)

    return graph.compile()


# Singleton compiled graph
_COMPILED_GRAPH = None

def get_analyst_graph():
    global _COMPILED_GRAPH
    if _COMPILED_GRAPH is None:
        _COMPILED_GRAPH = build_analyst_graph()
    return _COMPILED_GRAPH
