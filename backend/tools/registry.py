"""
Tool registry — wraps existing ARGUS analysis functions as callable tools
that return AnalysisResult-compatible dicts (spec section 6).
"""
from __future__ import annotations
import uuid
import traceback
from typing import Any, Dict, List, Optional

import pandas as pd

from backend.analysis.adapters import (
    compute_dataset_health,
    run_univariate_analysis,
    run_bivariate_analysis,
    run_correlation_analysis,
    run_multivariate_analysis,
    run_feature_importance,
    detect_target_variable,
    get_col_type,
    _correlation_strength,
)
from backend.analysis.cleaning_adapter import scan_dataset, clean_dataset, get_cleaning_summary
from backend.models.analysis import AnalysisType


def _make_id() -> str:
    return str(uuid.uuid4())[:8]


def _frame(session) -> pd.DataFrame:
    """The frame every tool should analyse: the cleaned one once it exists.

    Univariate and bivariate already preferred `cleaned_df`; correlation,
    multivariate and feature importance read `df` directly, so after a cleaning
    run half the workspace reported on repaired data and half on the raw upload.
    """
    return session.cleaned_df if session.cleaned_df is not None else session.df


def analyze_dataset_health(dataset_id: str) -> dict:
    """Tool: analyze_dataset_health"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    health = compute_dataset_health(_frame(session))
    return {
        "analysis_id": _make_id(),
        "analysis_type": "health",
        "title": "Dataset Health Report",
        "statistics": health,
        "methodology": (
            "100 - missing_penalty(max40) - dup_penalty(max20) - outlier_penalty(max40, IQR) "
            "- constant_column_penalty(max10)"
        ),
    }


def clean_dataset_tool(dataset_id: str, apply_cleaning: bool = True) -> dict:
    """Tool: clean_dataset"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    scan = scan_dataset(session.df)

    result = {
        "analysis_id": _make_id(),
        "analysis_type": "cleaning",
        "title": "Data Cleaning Report",
        "statistics": scan,
        "issues": scan["issues"],
        "warnings": [],
    }

    if apply_cleaning:
        cleaned_df, ops, warnings = clean_dataset(session.df)
        session.cleaned_df = cleaned_df
        session.cleaning_log = {"operations": ops, "warnings": warnings}
        result["operations"] = ops
        result["warnings"] = warnings
        result["cleaned_health"] = compute_dataset_health(cleaned_df)
        result["before_after"] = get_cleaning_summary(session.df, cleaned_df)

    return result


def _univariate_insight(col: str, data: dict) -> str:
    """One sentence per column, written for the type the column actually is.

    A single numeric-shaped template ("unique: N, mean: X") says nothing useful
    about a date range, a yes/no flag or a free-text field, and prints an empty
    `mean` for all three.
    """
    ctype = data.get("type")

    if data.get("analysis_skipped") == "empty" or ctype == "empty":
        return f"{col}: every value is missing, so there is nothing to summarise."

    if ctype == "identifier":
        pct = data.get("uniqueness_pct")
        dupes = data.get("duplicate_keys") or 0
        tail = (
            f" {dupes} value(s) repeat, so it is not a unique key."
            if dupes else " It is unique across every row."
        )
        return (
            f"[Identifier Notice] {col} looks like a key or index"
            + (f" ({pct}% distinct)." if pct is not None else ".")
            + tail
            + " Distribution statistics are skipped: a key has no distribution to describe."
        )

    if ctype == "constant":
        return (
            f"{col} holds a single value for every row, so it carries no information "
            "and is excluded from correlation and feature importance."
        )

    if ctype == "datetime":
        span = data.get("span_human") or "an unknown span"
        parts = [f"{col} spans {span} ({data.get('min')} to {data.get('max')})"]
        if data.get("inferred_frequency"):
            parts.append(f"at a regular {data['inferred_frequency']} cadence")
        if data.get("gap_count"):
            parts.append(f"with {data['gap_count']} gap(s), the largest {data.get('largest_gap')}")
        if data.get("duplicate_timestamps"):
            parts.append(f"{data['duplicate_timestamps']} timestamp(s) repeat")
        return ", ".join(parts) + "."

    if ctype == "boolean":
        true_pct = data.get("true_pct")
        base = f"{col} is true in {true_pct}% of rows" if true_pct is not None else f"{col} is a yes/no flag"
        if data.get("is_balanced") is False:
            base += f" — imbalanced at roughly {data.get('imbalance_ratio')}:1"
        return base + "."

    if ctype == "text":
        return (
            f"{col} is free text: {data.get('unique')} distinct values across {data.get('count')} rows "
            f"(median length {data.get('median_chars')} characters"
            + (f", common tokens: {', '.join(t['value'] for t in (data.get('top_tokens') or [])[:3])}"
               if data.get("top_tokens") else "")
            + ")."
        )

    if ctype in ("continuous", "discrete_numeric"):
        mean = data.get("mean")
        pieces = [f"{col}: mean {mean:.2f}" if isinstance(mean, (int, float)) else f"{col}"]
        if isinstance(data.get("median"), (int, float)):
            pieces.append(f"median {data['median']:.2f}")
        if isinstance(data.get("std"), (int, float)):
            pieces.append(f"std {data['std']:.2f}")
        sentence = ", ".join(pieces)
        if data.get("unit") == "percent":
            sentence += " (values are proportions, parsed from percentages)"
        elif data.get("unit") == "currency":
            sentence += " (parsed from currency text)"
        if data.get("transform_hint"):
            sentence += f". {data['transform_hint']}"
        return sentence + "."

    # Categorical
    mode = data.get("mode")
    mode_pct = data.get("mode_pct")
    sentence = f"{col}: {data.get('unique')} categories"
    if mode is not None:
        sentence += f", most common '{mode}'"
        if mode_pct is not None:
            sentence += f" ({mode_pct}% of rows)"
    if data.get("rare_levels"):
        sentence += f"; {data['rare_levels']} level(s) appear in under 1% of rows"
    return sentence + "."


def run_univariate_tool(dataset_id: str, columns: Optional[List[str]] = None, bins="auto",
                        top_n: int = 20, time_bucket: str = "auto", text_view: str = "length") -> dict:
    """Tool: run_univariate_analysis"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    df = _frame(session)
    columns = columns or list(df.columns)
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise ValueError(f"Unknown columns: {missing}")
    results = run_univariate_analysis(df, columns, bins=bins, top_n=top_n,
                                      time_bucket=time_bucket, text_view=text_view)
    charts = []
    insights = []
    first_viz = None
    for col, data in results.items():
        chart = data.get("chart")
        if chart:
            val_list = chart.get("values") or chart.get("data") or []
            lbl_list = chart.get("labels", [])
            ctype = chart.get("type", "histogram")
            charts.append({
                **chart,
                "column": col,
                "type": ctype,
                "title": str(col),
                "labels": lbl_list,
                "data": val_list,
                "values": val_list,
                # Carried through so the renderer can label the axes and the
                # per-chart narrator can tell a count axis (readable as shares of
                # the whole) from a measured one (where shares are meaningless).
                "xLabel": chart.get("xLabel", col),
                "yLabel": chart.get("yLabel", "Frequency"),
                "bins": chart.get("bins"),
            })
            if first_viz is None:
                first_viz = {
                    "type": ctype,
                    "data": {
                        **chart,
                        "labels": lbl_list,
                        "values": val_list,
                        "data": val_list,
                        "xLabel": chart.get("xLabel", col),
                        "yLabel": chart.get("yLabel", "Frequency"),
                        "bins": chart.get("bins"),
                    },
                }
        insights.append(_univariate_insight(str(col), data))

    # If single column analyzed, provide direct chart and flattened stats for instant UI card badges
    primary_stats = dict(results)
    if len(columns) == 1:
        col_name = columns[0]
        col_stats = results.get(col_name, {})
        for k, v in col_stats.items():
            if k not in ("chart", "health") and isinstance(v, (int, float, str, bool, list)):
                primary_stats[k] = v
        if col_stats.get("analysis_skipped") == "identifier" or col_stats.get("type") == "identifier":
            primary_stats["is_identifier"] = True

    viz = first_viz if (len(columns) == 1 and first_viz) else {"type": "multi", "charts": charts}

    return {
        "analysis_id": _make_id(),
        "analysis_type": "univariate",
        "title": f"Univariate: {', '.join(columns)}" if len(columns) <= 2 else "Univariate Analysis",
        "columns": columns,
        "visualization": viz,
        "statistics": primary_stats,
        "insights": insights,
        "bins_requested": bins,
    }


def run_bivariate_tool(dataset_id: str, col_a: str = "", col_b: str = "", aggregation: str = "auto") -> dict:
    """Tool: run_bivariate_analysis"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    df = session.cleaned_df if session.cleaned_df is not None else session.df
    cols = list(df.columns)
    if not cols:
        raise ValueError("Dataset has no columns")
    if not col_a or col_a not in cols:
        col_a = cols[0]
    if not col_b or col_b not in cols or col_b == col_a:
        candidates = [c for c in cols if c != col_a]
        col_b = candidates[0] if candidates else col_a
    result = run_bivariate_analysis(df, col_a, col_b, aggregation=aggregation)
    stats = result.get("statistics", {})
    viz = result.get("visualization", {})
    insights = []

    # 0. Time-series and duration insights (datetime axis)
    if stats.get("relationship") == "time_series":
        bucket = stats.get("bucket", "period")
        insights.append(
            f"'{stats.get('value_column')}' plotted over '{stats.get('time_column')}' by "
            f"{bucket} ({stats.get('buckets')} buckets, {stats.get('period_start')} to "
            f"{stats.get('period_end')})."
        )
        if stats.get("trend_direction"):
            slope = stats.get("trend_slope_per_period")
            pval = stats.get("p_value")
            strength = "statistically significant" if pval is not None and pval < 0.05 else "not statistically significant"
            insights.append(
                f"The trend is {stats['trend_direction']} at {slope} per {bucket} "
                f"(r = {stats.get('trend_r')}, p = {pval}) — {strength}."
            )
            if stats.get("change") is not None:
                pct = f" ({stats['change_pct']:+.1f}%)" if stats.get("change_pct") is not None else ""
                insights.append(
                    f"From first to last {bucket}: {stats.get('first_value')} -> "
                    f"{stats.get('last_value')}, a change of {stats['change']}{pct}."
                )
    elif stats.get("relationship") == "duration":
        insights.append(
            f"Elapsed time from '{col_a}' to '{col_b}' averages "
            f"{stats.get('mean_gap_days')} days (median {stats.get('median_gap_days')}, "
            f"range {stats.get('min_gap_days')} to {stats.get('max_gap_days')})."
        )
    elif stats.get("degenerate_column"):
        insights.append(
            f"No relationship can be measured: '{stats['degenerate_column']}' does not vary."
        )

    if stats.get("group_col") and stats.get("aggregation_used"):
        insights.append(
            f"Compared '{stats.get('value_col')}' across '{stats.get('group_col')}' using "
            f"{stats['aggregation_used']} ({stats.get('aggregation_reason', 'group summary')})."
        )

    # 1. Pearson / Correlation insights
    if stats.get("pearson_r") is not None:
        r = stats["pearson_r"]
        pval = stats.get("p_value")
        r2 = stats.get("r_squared")
        p_str = f" (p = {pval})" if pval is not None else ""
        r2_str = f", R² = {r2}" if r2 is not None else ""
        if abs(r) < 0.1:
            insights.append(f"Weak/negligible linear relationship (r = {r:.3f}{r2_str}){p_str} between {col_a} and {col_b}.")
        elif abs(r) < 0.35:
            insights.append(f"Moderate {'positive' if r > 0 else 'negative'} correlation (r = {r:.3f}{r2_str}){p_str} between {col_a} and {col_b}.")
        else:
            insights.append(f"Strong {'positive' if r > 0 else 'negative'} relationship (r = {r:.3f}{r2_str}){p_str} between {col_a} and {col_b}.")

    # 2. ANOVA group comparison insights
    if stats.get("eta_squared") is not None:
        eta = stats["eta_squared"]
        f_stat = stats.get("f_statistic")
        pval = stats.get("p_value")
        high = stats.get("highest_group")
        low = stats.get("lowest_group")
        spread = stats.get("spread")
        sig = "statistically significant" if pval is not None and pval < 0.05 else "not statistically significant"
        insights.append(f"Category differences are {sig} (One-Way ANOVA F = {f_stat}, p = {pval}, eta² = {eta}).")
        if high and low and high != low:
            insights.append(f"Highest group is '{high}', lowest is '{low}' (mean spread = {spread}).")

    # 3. Chi-Square / Categorical association insights
    if stats.get("chi2") is not None:
        chi2 = stats["chi2"]
        pval = stats.get("chi2_p_value")
        cv = stats.get("cramers_v")
        sig = "significant association" if pval is not None and pval < 0.05 else "no significant association"
        insights.append(f"Chi-square test: {sig} (chi² = {chi2}, p = {pval}, Cramér's V = {cv}).")

    # 4. Identifier sequence drift insight
    if stats.get("is_identifier_binned"):
        id_col = stats.get("identifier_column", col_a)
        target_col = stats.get("target_column", col_b)
        n_bins = stats.get("num_bins", 10)
        insights.append(f"Grouped '{id_col}' into {n_bins} quantiles to inspect for sequence drift across '{target_col}'.")

    if not insights and result.get("methodology"):
        insights.append(result["methodology"])

    stats_title = (
        f"{stats.get('value_col')} by {stats.get('group_col')} · {stats.get('aggregation_used').title()}"
        if stats.get("group_col") and stats.get("aggregation_used")
        else f"{col_a} vs {col_b}"
    )
    return {
        "analysis_id": _make_id(),
        "analysis_type": "bivariate",
        "title": stats_title,
        "columns": [col_a, col_b],
        "visualization": {"type": viz.get("type", "scatter"), "data": viz.get("data", {})},
        "statistics": stats,
        "insights": insights,
        "warnings": result.get("warnings", []),
        "methodology": result.get("methodology"),
        "aggregation_requested": result.get("aggregation_requested", aggregation),
        "aggregation_used": stats.get("aggregation_used"),
    }


def run_correlation_tool(
    dataset_id: str,
    top_n: int = 10,
    method: str = "pearson",
    target_column: Optional[str] = None,
    columns: Optional[List[str]] = None,
) -> dict:
    """Tool: run_correlation_analysis"""
    from backend.services.dataset_service import get_dataset
    from scipy.stats import pearsonr
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    df = _frame(session)
    result = run_correlation_analysis(df, top_n, method=method)
    pairs = result.get("pairs", [])
    insights: List[str] = []

    # If specific columns were requested (e.g. ['Survived', 'Fare']):
    if columns and len(columns) >= 2:
        c1, c2 = columns[0], columns[1]
        c1_low, c2_low = c1.casefold(), c2.casefold()

        # Check if this exact pair exists in calculated pairs
        pair_match = next((
            p for p in pairs
            if (p["col_a"].casefold() == c1_low and p["col_b"].casefold() == c2_low)
            or (p["col_a"].casefold() == c2_low and p["col_b"].casefold() == c1_low)
        ), None)

        if pair_match:
            r = pair_match.get("pearson_r") if pair_match.get("pearson_r") is not None else pair_match.get("correlation", 0.0)
            rho = pair_match.get("spearman_rho")
            strength = pair_match.get("strength", "moderate")
            n_samples = pair_match.get("sample_size", len(df))

            p_val_str = ""
            try:
                valid = df[[pair_match["col_a"], pair_match["col_b"]]].dropna()
                s_a = pd.to_numeric(valid[pair_match["col_a"]], errors="coerce")
                s_b = pd.to_numeric(valid[pair_match["col_b"]], errors="coerce")
                valid_num = pd.DataFrame({"a": s_a, "b": s_b}).dropna()
                if len(valid_num) > 2 and valid_num["a"].nunique() > 1 and valid_num["b"].nunique() > 1:
                    _, p_val = pearsonr(valid_num["a"], valid_num["b"])
                    p_val_str = " (p < 0.001)" if p_val < 0.001 else f" (p = {p_val:.4f})"
            except Exception:
                pass

            title = f"Correlation: {pair_match['col_a']} vs. {pair_match['col_b']} (r = {r:+.3f})"
            insights.append(
                f"Pearson correlation between '{pair_match['col_a']}' and '{pair_match['col_b']}' is r = {r:+.4f}{p_val_str}, indicating a {strength} relationship."
            )
            if rho is not None:
                insights.append(
                    f"Spearman rank correlation is rho = {rho:+.4f} across {n_samples} complete records."
                )
            if pair_match.get("nonlinear"):
                insights.append(pair_match["note"])

            if abs(r) < 0.1:
                insights.append(f"Negligible linear association. Changes in '{pair_match['col_a']}' do not reliably correlate with '{pair_match['col_b']}'.")
            elif r > 0:
                insights.append(f"Positive correlation: higher values of '{pair_match['col_a']}' are associated with higher values of '{pair_match['col_b']}'.")
            else:
                insights.append(f"Negative correlation: higher values of '{pair_match['col_a']}' are associated with lower values of '{pair_match['col_b']}'.")

            # Prioritize pair at the top of pairs list
            result["pairs"] = [pair_match] + [p for p in pairs if p != pair_match]
            result["target_column"] = pair_match["col_a"]
            result["highlight_pair"] = [pair_match["col_a"], pair_match["col_b"]]

            return {
                "analysis_id": _make_id(),
                "analysis_type": "correlation",
                "title": title,
                "statistics": result,
                "insights": insights,
                "warnings": result.get("warnings", []),
                "methodology": f"Bivariate correlation computed using Pearson r and Spearman ρ on complete pairs (n = {n_samples}).",
            }
        elif c1 in df.columns and c2 in df.columns:
            assoc = result.get("association", {})
            assoc_mat = assoc.get("matrix", {})
            val = assoc_mat.get(c1, {}).get(c2) or assoc_mat.get(c2, {}).get(c1)
            if val is not None:
                title = f"Association: {c1} vs. {c2} (score = {val:.3f})"
                insights.append(f"The statistical association between '{c1}' and '{c2}' is {val:.4f} (scale 0 to 1).")
                insights.append("Computed using Cramér's V and correlation ratio (eta) for mixed categorical/numeric columns.")
                return {
                    "analysis_id": _make_id(),
                    "analysis_type": "correlation",
                    "title": title,
                    "statistics": result,
                    "insights": insights,
                    "warnings": result.get("warnings", []),
                    "methodology": f"Mixed association analysis between '{c1}' and '{c2}'.",
                }

    # If a specific target column was requested, prioritize pairs with that target
    if target_column and pairs:
        t_low = target_column.casefold()
        target_pairs = [p for p in pairs if p["col_a"].casefold() == t_low or p["col_b"].casefold() == t_low]
        if target_pairs:
            pairs = target_pairs
            result["pairs"] = target_pairs
            top = target_pairs[0]
            other = top["col_b"] if top["col_a"].casefold() == t_low else top["col_a"]
            insights.append(
                f"Top correlated feature with target '{target_column}' is '{other}' "
                f"({method} = {top['correlation']}, {top['strength']})."
            )

    if pairs and not (target_column and insights):
        top = pairs[0]
        insights.append(
            f"Strongest relationship: {top['col_a']} and {top['col_b']} "
            f"({method} = {top['correlation']}, {top['strength']})."
        )
        insights.append(
            f"Screened {result.get('all_pairs_count', len(pairs))} pairs across "
            f"{len(result.get('numeric_columns', []))} numeric, boolean and date columns."
        )
    elif not pairs and not insights:
        insights.append("No two columns had enough varying numeric values to correlate.")
    for pair in result.get("nonlinear_pairs", [])[:2]:
        insights.append(
            f"{pair['col_a']} vs {pair['col_b']} is monotonic but non-linear "
            f"(Spearman {pair['spearman_rho']} vs Pearson {pair['correlation']})."
        )
    association = result.get("association", {})
    if association.get("columns"):
        cat_count = sum(1 for k in association.get("kinds", {}).values() if k == "categorical")
        if cat_count:
            insights.append(
                f"The association matrix also covers {cat_count} categorical column(s) "
                "using Cramer's V and the correlation ratio."
            )
    insights.extend(result.get("warnings", []))
    return {
        "analysis_id": _make_id(),
        "analysis_type": "correlation",
        "title": "Correlation Analysis",
        "statistics": result,
        "insights": insights,
        "warnings": result.get("warnings", []),
        "methodology": result.get("methodology"),
    }


def run_multivariate_tool(dataset_id: str, target: Optional[str] = None, n_clusters="auto") -> dict:
    """Tool: run_multivariate_analysis"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    df = _frame(session)
    if target is None:
        target = detect_target_variable(df)
    result = run_multivariate_analysis(df, target, n_clusters=n_clusters)
    insights: List[str] = []
    influencers = result.get("top_influencers") or []
    if influencers:
        task = result.get("task", "model")
        insights.append(
            f"{result.get('model', 'Random Forest')} ({task}) on '{result.get('target', target)}': "
            f"top driver is {influencers[0]['feature']} "
            f"({influencers[0]['importance'] * 100:.1f}% of the explained signal)."
        )
        if len(influencers) > 1:
            insights.append(
                "Next: " + ", ".join(item["feature"] for item in influencers[1:4]) + "."
            )
    clusters = result.get("pca_clusters")
    if clusters:
        sizes = ", ".join(f"{k}: {v}" for k, v in clusters.get("cluster_sizes", {}).items())
        insights.append(
            f"PCA reduced {len(clusters.get('features_used', []))} numeric columns to 2 components "
            f"explaining {clusters.get('explained_variance_total', 0) * 100:.1f}% of the variance; "
            f"K-Means found {clusters.get('n_clusters')} groups ({sizes})."
        )
        drivers = clusters.get("pc1_drivers") or []
        if drivers:
            insights.append(
                "Component 1 is driven mainly by "
                + ", ".join(item["feature"] for item in drivers[:3]) + "."
            )
    insights.extend(result.get("warnings", []))

    # Multivariate computes two pictures — an influencer ranking and a PCA
    # cluster scatter — but returned neither, so the renderer had nothing to
    # dispatch on and the tab drew no chart at all. Both are published here as a
    # `multi` visualization, which is also what gives each of them its own
    # AI description.
    charts: List[Dict[str, Any]] = []
    if influencers:
        charts.append({
            "column": result.get("target", target) or "target",
            "type": "hbar",
            "title": f"What drives {result.get('target', target)}",
            "features": influencers,
            "target": result.get("target", target),
        })
    if clusters and clusters.get("points"):
        charts.append({
            "column": "Principal components",
            "type": "clusters",
            "title": f"{clusters.get('n_clusters')} natural groups (PCA + K-Means)",
            **clusters,
        })

    return {
        "analysis_id": _make_id(),
        "analysis_type": "multivariate",
        "title": "Multivariate Analysis",
        "columns": [target] if target else [],
        "visualization": {"type": "multi", "charts": charts} if charts else None,
        "statistics": result,
        "insights": insights,
        "warnings": result.get("warnings", []),
        "methodology": result.get("methodology"),
    }


def _feature_importance_insights(result: dict, target: Optional[str]) -> List[str]:
    """Narrate an importance run, including the honest version of its score."""
    if result.get("error"):
        return [result["error"]]
    ranked = result.get("feature_importance") or []
    if not ranked:
        return ["No feature importance data"]
    insights = [
        f"Top driver of '{result.get('target', target)}': {ranked[0]['feature']} "
        f"({ranked[0]['pct']}% of the model's explained signal)."
    ]
    if result.get("drivers_for_80pct"):
        insights.append(
            f"{result['drivers_for_80pct']} of {result.get('n_features')} features account "
            "for 80% of the total importance."
        )
    if result.get("task") == "classification":
        cv = result.get("cv_accuracy")
        base = result.get("baseline_accuracy")
        insights.append(
            f"Fitted as a classification problem over {len(result.get('classes') or [])} classes"
            + (f"; cross-validated accuracy {cv:.1%}" if isinstance(cv, (int, float)) else "")
            + (f" against a {base:.1%} majority-class baseline." if isinstance(base, (int, float)) else ".")
        )
    elif result.get("task") == "regression":
        cv = result.get("cv_r_squared")
        insights.append(
            "Fitted as a regression problem"
            + (f"; cross-validated R² {cv:.3f}" if isinstance(cv, (int, float)) else "")
            + f" (in-sample R² {result.get('r_squared')})."
        )
    if result.get("encoding"):
        insights.append("Encoding applied — " + "; ".join(result["encoding"][:3]) + ".")
    if result.get("features_skipped"):
        insights.append("Excluded: " + ", ".join(result["features_skipped"][:4]) + ".")
    return insights


def run_feature_discovery_tool(dataset_id: str) -> dict:
    """Tool: run_feature_discovery"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    df = _frame(session)
    target = detect_target_variable(df)
    result = run_feature_importance(df, target) if target else {
        "error": "No column in this dataset is shaped like a prediction target."
    }
    insights = [f"Detected target: {target}"] if target else []
    insights.extend(_feature_importance_insights(result, target))
    return {
        "analysis_id": _make_id(),
        "analysis_type": "feature_discovery",
        "title": "Feature Discovery",
        "columns": [target] if target else [],
        "statistics": result,
        "insights": insights,
        "methodology": result.get("methodology"),
    }


def run_feature_importance_tool(dataset_id: str, target: str) -> dict:
    """Tool: run_feature_importance"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    df = _frame(session)
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found")
    result = run_feature_importance(df, target)
    return {
        "analysis_id": _make_id(),
        "analysis_type": "feature_importance",
        "title": f"Feature Importance for {target}",
        # The features the model actually used, not every numeric column: the
        # old list came from select_dtypes and so both omitted the encoded
        # categoricals and named columns the model never saw.
        "columns": [item["feature"] for item in result.get("feature_importance", [])],
        "statistics": result,
        "insights": _feature_importance_insights(result, target),
        "methodology": result.get("methodology"),
    }


def generate_dataset_summary(dataset_id: str) -> dict:
    """Tool: generate_dataset_summary"""
    from backend.services.dataset_service import get_dataset
    session = get_dataset(dataset_id)
    if session is None:
        raise ValueError(f"Dataset {dataset_id} not found")
    from backend.analysis.adapters import run_eda, detect_target_variable
    df = session.df
    stats = run_eda(df, session.dataset_name)
    name = session.dataset_name or "Dataset"
    rows = stats.get("rows", len(df))
    cols = stats.get("columns", len(df.columns))
    col_names = stats.get("column_names", list(df.columns))
    missing = stats.get("missing_total", int(df.isnull().sum().sum()))
    target = detect_target_variable(df)
    target_str = f" Target variable candidate: `{target}`." if target else ""
    
    num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    cat_cols = [c for c in df.columns if c not in num_cols]
    
    insights = [
        f"The dataset contains {rows:,} observations across {cols} features ({len(num_cols)} numeric, {len(cat_cols)} categorical).",
        f"Primary features include: {', '.join(col_names[:7])}{'...' if len(col_names) > 7 else ''}.{target_str}",
        f"Data completeness: {missing:,} total missing cells detected across the entire table.",
    ]
    return {
        "analysis_id": _make_id(),
        "analysis_type": "overview",
        "title": f"Dataset Summary ({name})",
        "insights": insights,
        "statistics": stats,
    }


# ── Tool registry ──────────────────────────────────────────────────────────────

TOOL_REGISTRY = {
    "analyze_dataset_health": analyze_dataset_health,
    "clean_dataset": clean_dataset_tool,
    "run_univariate_analysis": run_univariate_tool,
    "run_bivariate_analysis": run_bivariate_tool,
    "run_correlation_analysis": run_correlation_tool,
    "run_multivariate_analysis": run_multivariate_tool,
    "run_feature_discovery": run_feature_discovery_tool,
    "run_feature_importance": run_feature_importance_tool,
    "generate_dataset_summary": generate_dataset_summary,
}


def execute_tool(tool_name: str, dataset_id: str, **kwargs) -> dict:
    """Execute a registered tool, catching and wrapping errors."""
    if tool_name not in TOOL_REGISTRY:
        raise ValueError(f"Unknown tool: {tool_name}")
    try:
        out = TOOL_REGISTRY[tool_name](dataset_id, **kwargs)
    except Exception as e:
        return {
            "analysis_id": _make_id(),
            "analysis_type": "error",
            "title": f"Tool execution failed: {tool_name}",
            "statistics": {},
            "insights": [],
            "warnings": [f"{type(e).__name__}: {str(e)}"],
            "error": str(e),
            "traceback": traceback.format_exc(limit=3),
        }
    try:
        from backend.services.dataset_service import get_dataset
        from backend.analysis.visualization_planner import attach_visualization_plan
        attach_visualization_plan(out, get_dataset(dataset_id))
    except Exception:
        # A presentation hint is optional; the computed result must still reach
        # the caller if planning or an LLM provider is unavailable.
        pass
    try:
        from backend.analysis.adapters import sanitize_for_json
        return sanitize_for_json(out)
    except Exception:
        return out
