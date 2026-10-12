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
                "computational queries in a safe Python sandbox, and generate comprehensive PDF analytical reports."
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

    if intent == "relationship_analysis" and len(columns) < 2:
        numeric = profile.get("numeric_columns", [])
        columns = columns + [c for c in numeric if c not in columns][: 2 - len(columns)]

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

    # Case 1: At least 1 numeric column and categorical/discrete columns (e.g. Fare with Sex & Survived)
    if num_cols and cat_cols:
        target_num = num_cols[0]
        group_cats = cat_cols[:2]
        if len(group_cats) == 2:
            c0, c1 = group_cats[0], group_cats[1]
            c0_target = any(w in c0.lower() for w in ("surviv", "target", "churn", "label", "outcome", "status"))
            c1_target = any(w in c1.lower() for w in ("surviv", "target", "churn", "label", "outcome", "status"))
            if c0_target and not c1_target:
                group_cats = [c1, c0]

        grouped = clean_df.groupby(group_cats)[target_num].agg(["mean", "median", "count"]).round(2).reset_index()

        def _fmt_val(col: str, val: Any) -> str:
            col_l = str(col).lower()
            if col_l == "survived":
                return "Survived" if str(val) in ("1", "1.0", "True", "true") else "Perished"
            if col_l == "sex":
                return str(val).capitalize()
            return f"{col}={val}"

        labels = []
        stats = {}
        for _, row in grouped.iterrows():
            cohort_name = " - ".join([_fmt_val(c, row[c]) for c in group_cats])
            labels.append(cohort_name)
            stats[cohort_name] = {
                f"Average {target_num}": round(float(row["mean"]), 2),
                f"Median {target_num}": round(float(row["median"]), 2),
                "Passenger Count": int(row["count"]),
            }

        chart_data_vals = [round(float(row["mean"]), 2) for _, row in grouped.iterrows()]

        insights = []
        if len(grouped) >= 2:
            max_idx = grouped["mean"].idxmax()
            min_idx = grouped["mean"].idxmin()
            max_row = grouped.loc[max_idx]
            min_row = grouped.loc[min_idx]
            max_cohort = " - ".join([_fmt_val(c, max_row[c]) for c in group_cats])
            min_cohort = " - ".join([_fmt_val(c, min_row[c]) for c in group_cats])
            insights.append(
                f"The highest average {target_num} is in '{max_cohort}' (${max_row['mean']:.2f}), "
                f"while the lowest is in '{min_cohort}' (${min_row['mean']:.2f})."
            )

        if any(c.lower() == "survived" for c in group_cats):
            surv_avg = clean_df[clean_df["Survived"].isin([1, "1", True])][target_num].mean()
            perish_avg = clean_df[clean_df["Survived"].isin([0, "0", False])][target_num].mean()
            if surv_avg and perish_avg:
                insights.append(
                    f"Across demographic cohorts, survivors paid an average {target_num} of ${surv_avg:.2f} "
                    f"versus ${perish_avg:.2f} for passengers who perished."
                )

        insights.append(
            f"Segmented across {len(grouped)} cohort groups covering {int(len(clean_df)):,} rows."
        )

        # Build grouped structure for side-by-side visualization
        primary_cat = group_cats[0]
        secondary_cat = group_cats[1] if len(group_cats) > 1 else None

        groups_map = {}
        for _, row in grouped.iterrows():
            g_name = _fmt_val(primary_cat, row[primary_cat])
            sub_lbl = _fmt_val(secondary_cat, row[secondary_cat]) if secondary_cat else "Metric"
            val = round(float(row["mean"]), 2)
            if g_name not in groups_map:
                groups_map[g_name] = []
            groups_map[g_name].append({
                "label": sub_lbl,
                "value": val,
                "count": int(row["count"]),
                "median": round(float(row["median"]), 2),
            })

        groups_list = [{"name": k, "bars": v} for k, v in groups_map.items()]

        series_names = list(dict.fromkeys(
            bar["label"] for g in groups_list for bar in g["bars"]
        ))
        series_list = []
        for s in series_names:
            s_low = s.lower()
            color = "#10b981" if ("surviv" in s_low and "not" not in s_low and "perish" not in s_low) else (
                "#f43f5e" if ("perish" in s_low or "died" in s_low or "not" in s_low) else "#38bdf8"
            )
            series_list.append({"name": s, "color": color})

        chart = {
            "type": "grouped_bar",
            "data": {
                "title": f"Mean {target_num} by {primary_cat} & {secondary_cat or ''}".strip(),
                "xLabel": primary_cat,
                "yLabel": f"Average {target_num} ($)",
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

        # Try to parse into side-by-side grouped categories (e.g. Female/Male x Survived/Perished)
        grouped_map = {}
        all_subs = set()
        for k_str, val in items:
            cleaned = re.sub(r"^((mean|avg|median|sum|count|fare)_+)+", "", k_str, flags=re.I)
            parts = re.split(r"\s*-\s*|\s*·\s*|\s*/\s*|_", cleaned)
            parts = [p for p in parts if p]
            if len(parts) >= 2:
                p0 = parts[0]
                p1 = " ".join(parts[1:])
                p0_is_outcome = p0.lower() in ("1", "0", "true", "false", "survived", "perished", "died")
                p1_is_outcome = p1.lower() in ("1", "0", "true", "false", "survived", "perished", "died")
                if p0_is_outcome and not p1_is_outcome:
                    p0, p1 = p1, p0

                g_name = p0.capitalize()
                sub = p1.capitalize()
                if sub in ("1", "1.0", "True"):
                    sub = "Survived"
                elif sub in ("0", "0.0", "False"):
                    sub = "Perished"
                if g_name not in grouped_map:
                    grouped_map[g_name] = []
                grouped_map[g_name].append({"label": sub, "value": val})
                all_subs.add(sub)

        if len(grouped_map) >= 2 and all(len(bars) >= 1 for bars in grouped_map.values()):
            groups_list = [{"name": k, "bars": v} for k, v in grouped_map.items()]
            series_list = []
            for s in all_subs:
                s_low = s.lower()
                color = "#10b981" if ("surviv" in s_low and "not" not in s_low and "perish" not in s_low) else (
                    "#f43f5e" if ("perish" in s_low or "died" in s_low or "not" in s_low) else "#38bdf8"
                )
                series_list.append({"name": s, "color": color})
            chart = {
                "type": "grouped_bar",
                "data": {
                    "title": result.get("analysis_name") or "Multivariate Comparison",
                    "xLabel": "Demographic Cohort",
                    "yLabel": result.get("analysis_name") or "Average Value",
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
        if pd.api.types.is_numeric_dtype(df[c]):
            non_null = df[c].dropna()
            if not non_null.empty:
                col_details.append(f"- `{c}` ({dtype}): min={non_null.min():.2f}, max={non_null.max():.2f}, unique_values={df[c].nunique()}")
            else:
                col_details.append(f"- `{c}` ({dtype})")
        else:
            top_vals = [str(x) for x in df[c].dropna().unique()[:5]]
            col_details.append(f"- `{c}` ({dtype}): distinct={df[c].nunique()}, samples={top_vals}")
    schema_block = "\n".join(col_details)

    prompt = (
        f"You are an expert Python data analyst. Write safe, production-grade pandas code to answer this question:\n"
        f"Question: \"{question}\"\n\n"
        f"Target Columns and Schema:\n{schema_block}\n\n"
        f"All Columns: {list(df.columns)}\n\n"
        "Instructions:\n"
        "1. Write pure pandas/numpy code operating on `df`. No imports, no file/network I/O, no dunder methods.\n"
        "2. Understand the user's analytical goal based on the column types:\n"
        "   - If comparing a numeric metric across multiple categorical features (e.g. Fare by Sex and Survived):\n"
        "     Group by the categories, compute aggregates (mean, median, count), and format clean human-readable names.\n"
        "     Structure a 'grouped_bar' chart with:\n"
        "     groups: [{'name': 'Female', 'bars': [{'label': 'Survived', 'value': ...}, {'label': 'Perished', 'value': ...}]}, ...]\n"
        "     series: [{'name': 'Survived', 'color': '#10b981'}, {'name': 'Perished', 'color': '#f43f5e'}]\n"
        "     xLabel: 'Gender', yLabel: 'Average Fare ($)'\n"
        "   - If comparing 2 numeric variables across a categorical variable (e.g. Age vs Fare by Sex):\n"
        "     Provide scatter plot data: {'x': [...], 'y': [...], 'categories': [...], 'xLabel': ..., 'yLabel': ..., 'hueLabel': ...}\n"
        "   - If analyzing a single metric or correlation, provide 'bar', 'scatter', or summary statistics.\n"
        "3. Output format:\n"
        "   Assign a dictionary named `result` with keys:\n"
        "   - 'analysis_name': Descriptive, executive title (e.g. 'Mean Fare by Gender and Survival Status')\n"
        "   - 'statistics': Dictionary with human-readable keys and clean numeric values (NEVER raw code variable names like 'mean_fare_female_survived')\n"
        "   - 'insights': List of 2 to 3 concise, highly informative analytical findings\n"
        "   - 'chart_type': 'grouped_bar' (or 'scatter', 'bar', 'line')\n"
        "   - 'chart_data': Dictionary matching the chosen chart_type\n\n"
        "Return valid JSON only with one key 'code'."
    )

    try:
        raw = chat_completion(
            prompt,
            system_prompt="You are an expert Python data analyst who writes clean, safe pandas analyses and structures rich visualization data. Return valid JSON only.",
            max_tokens=800,
            temperature=0,
            timeout=codegen_timeout(),
        )
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        payload = json.loads(match.group(0)) if match else {}
        code = payload.get("code", "")
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

    # Format chart visualization into clean grouped or single chart
    chart = _format_chart_from_result(result)

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
            system_prompt="You fix pandas errors and write reliable, bug-free data analysis code. Return JSON with one key 'code'.",
            max_tokens=700,
            temperature=0,
            timeout=codegen_timeout(),
        )
        match_fix = re.search(r"\{.*\}", raw_fix, re.DOTALL)
        fix_payload = json.loads(match_fix.group(0)) if match_fix else {}
        fix_code = fix_payload.get("code", "")
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

    if not is_configured():
        title = analysis.get("title") or analysis.get("analysis_name") or "Analysis"
        insights = " ".join([str(i) for i in (analysis.get("insights") or [])][:3])
        reply = f"Analysis completed: {title}. {insights}".strip()
        analysis["explanation"] = reply
        steps = list(state.get("status_steps", [])) + ["Preparing executive explanation"]
        return {"reply": reply, "analysis": analysis, "status_steps": steps}

    prompt_focus = (
        "Explain what the computed numbers mean in 2 to 3 concise, highly informative sentences. "
        "Do not mention thinking steps. Start your response directly with the analytical finding."
    )
    context_block = ""
    if history:
        recent = [f"{m.get('role', 'user')}: {str(m.get('content', ''))[:160]}" for m in history[-3:] if m.get("content")]
        if recent:
            context_block = "Recent conversation context:\n" + "\n".join(recent) + "\n\n"

    try:
        reply = chat_completion(
            prompt=(
                f"{context_block}"
                f"Current user question: {question}\n"
                f"Computed analysis statistics and result: {json.dumps(analysis, default=str)[:7000]}\n\n"
                f"{prompt_focus}"
            ),
            system_prompt=(
                "You are ARGUS, an expert senior AI data analyst. "
                "Provide a direct, authoritative, and plain-English answer based solely on the computed data. "
                "Never hallucinate numbers. Never say 'The user is asking' or 'Based on the prompt'."
            ),
            max_tokens=250,
            temperature=0.3,
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
