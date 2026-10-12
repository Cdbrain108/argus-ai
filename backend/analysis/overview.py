"""
backend/analysis/overview.py — Computes the 6 Overview widgets (spec & Streamlit parity).
Provides structure breakdown, missing value map, outlier summary, skewness distribution,
and strongest correlations.
"""
from __future__ import annotations
from typing import Any, Dict, List
import pandas as pd
import numpy as np

from backend.analysis.column_types import logical_type


def compute_dataset_overview(df: pd.DataFrame) -> Dict[str, Any]:
    """Compute the full suite of dataset overview metrics matching original ARGUS."""
    n_rows = len(df)
    n_cols = len(df.columns)
    if n_rows == 0 or n_cols == 0:
        return {
            "structure": {
                "n_rows": 0, "n_cols": 0,
                "n_numeric": 0, "n_categorical": 0, "n_datetime": 0, "n_boolean": 0,
                "pct_numeric": 0, "pct_categorical": 0, "pct_datetime": 0, "pct_boolean": 0,
            },
            "missing_map": [],
            "all_clean": True,
            "outliers": {
                "total_outlier_rows": 0, "outlier_pct": 0.0, "cols_affected": 0, "top_columns": [],
            },
            "skewness": [],
            "top_correlations": [],
        }

    # 1. Structure & Column breakdown
    bool_cols = [c for c in df.columns if logical_type(df[c]) == "boolean"]
    num_cols = [
        c for c in df.select_dtypes(include="number").columns.tolist()
        if c not in bool_cols and logical_type(df[c]) not in {"identifier", "constant", "empty"}
    ]
    num_cols = [c for c in num_cols if c not in bool_cols]
    cat_cols = [
        c for c in df.select_dtypes(include=["object", "category", "string"]).columns.tolist()
        if logical_type(df[c]) not in {"text", "identifier", "constant", "empty"}
    ]
    dt_cols = df.select_dtypes(include=["datetime", "datetimetz"]).columns.tolist()

    pn = round(len(num_cols) / max(n_cols, 1) * 100)
    pc = round(len(cat_cols) / max(n_cols, 1) * 100)
    pd_ = round(len(dt_cols) / max(n_cols, 1) * 100)
    pb = round(len(bool_cols) / max(n_cols, 1) * 100)

    # 2. Missing value map per column
    missing_dict = (df.isnull().mean() * 100).round(1).to_dict()
    missing_counts = df.isnull().sum().to_dict()
    missing_map = []
    for c in df.columns:
        pct = float(missing_dict.get(c, 0.0))
        cnt = int(missing_counts.get(c, 0))
        sev = "clean" if pct == 0 else "low" if pct < 10 else "medium" if pct < 50 else "high"
        missing_map.append({
            "column": str(c),
            "missing_count": cnt,
            "missing_pct": pct,
            "severity": sev,
        })

    # 3. Outlier summary via IQR
    outlier_details = []
    sample_df = df if n_rows <= 25000 else df.sample(25000, random_state=42)
    for col in num_cols:
        s = pd.to_numeric(sample_df[col], errors="coerce").dropna()
        if len(s) >= 4:
            q1, q3 = s.quantile(0.25), s.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                cnt = int(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).sum())
                if cnt > 0:
                    pct = round(cnt / len(s) * 100, 1)
                    outlier_details.append({"column": str(col), "count": cnt, "pct": pct})
    outlier_details.sort(key=lambda x: x["count"], reverse=True)

    outlier_row_count = 0
    outlier_row_pct = 0.0
    if num_cols:
        try:
            masks = []
            for col in num_cols:
                s = pd.to_numeric(df[col], errors="coerce")
                q1, q3 = s.quantile(0.25), s.quantile(0.75)
                iqr = q3 - q1
                if iqr > 0:
                    masks.append((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr))
            if masks:
                combined = pd.concat(masks, axis=1).any(axis=1)
                outlier_row_count = int(combined.sum())
                outlier_row_pct = round(outlier_row_count / max(n_rows, 1) * 100, 1)
        except Exception:
            pass

    # 4. Skewness
    skew_scores = []
    for col in num_cols:
        clean = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(clean) > 10:
            try:
                val = float(clean.skew())
                if not np.isnan(val):
                    direction = "right" if val > 0.05 else "left" if val < -0.05 else "normal"
                    sev = "high" if abs(val) > 1 else "moderate" if abs(val) > 0.5 else "normal"
                    skew_scores.append({
                        "column": str(col),
                        "skew": round(val, 2),
                        "abs_skew": round(abs(val), 2),
                        "direction": direction,
                        "severity": sev,
                    })
            except Exception:
                pass
    skew_scores.sort(key=lambda x: x["abs_skew"], reverse=True)

    # 5. Top correlations
    top_pairs = []
    if len(num_cols) >= 2:
        try:
            corr = df[num_cols].corr()
            for i in range(len(num_cols)):
                for j in range(i + 1, len(num_cols)):
                    r = corr.iloc[i, j]
                    if not pd.isna(r):
                        r_val = round(float(r), 2)
                        abs_r = abs(r_val)
                        strength = "strong" if abs_r >= 0.7 else "moderate" if abs_r >= 0.4 else "weak"
                        top_pairs.append({
                            "col_a": str(num_cols[i]),
                            "col_b": str(num_cols[j]),
                            "r": r_val,
                            "abs_r": abs_r,
                            "strength": strength,
                        })
            top_pairs.sort(key=lambda x: x["abs_r"], reverse=True)
        except Exception:
            pass

    return {
        "structure": {
            "n_rows": n_rows,
            "n_cols": n_cols,
            "n_numeric": len(num_cols),
            "n_categorical": len(cat_cols),
            "n_datetime": len(dt_cols),
            "n_boolean": len(bool_cols),
            "pct_numeric": pn,
            "pct_categorical": pc,
            "pct_datetime": pd_,
            "pct_boolean": pb,
        },
        "missing_map": missing_map,
        "all_clean": all(m["severity"] == "clean" for m in missing_map),
        "outliers": {
            "total_outlier_rows": outlier_row_count,
            "outlier_pct": outlier_row_pct,
            "cols_affected": len(outlier_details),
            "top_columns": outlier_details[:5],
        },
        "skewness": skew_scores[:5],
        "top_correlations": top_pairs[:5],
    }
