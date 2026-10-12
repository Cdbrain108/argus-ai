"""
Data cleaning adapter — scan -> plan -> apply, matching spec sections 19 + 22.4.

The logic originates in the Streamlit build's ``SmartDataCleaner`` but is
reimplemented here rather than imported: the original module pulls in
``utils.get_groq_client``, which imports Streamlit. Nothing under ``backend/``
imports ``existing_argus/`` — that keeps the server runnable without the
Streamlit stack installed.
"""
from __future__ import annotations
import re
import warnings
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from backend.analysis.column_types import NULL_TOKENS, logical_type, normalize_frame

warnings.filterwarnings("ignore")

#: Above this missing rate, imputing invents data rather than repairing it: a
#: column that is 90% empty becomes 90% one fabricated constant, which then
#: reads as a strong signal in every downstream analysis. Flag it instead.
_IMPUTE_MAX_MISSING = 0.5

#: Imputing a key is never right — filling gaps with the modal id manufactures
#: duplicate keys out of nothing.
_NEVER_IMPUTE = ("identifier", "constant", "empty")


def _scan_missing_values_df(df: pd.DataFrame) -> List[dict]:
    """Return list of columns with missing data."""
    report = []
    total_rows = len(df)
    for col in df.columns:
        null_mask = df[col].isnull()
        if df[col].dtype == object or pd.api.types.is_string_dtype(df[col]):
            str_mask = df[col].astype(str).str.strip() == ""
            null_mask = null_mask | str_mask
        missing_count = int(null_mask.sum())
        if missing_count > 0:
            report.append({
                "column": col,
                "dtype": str(df[col].dtype),
                "missing_count": missing_count,
                "pct_missing": round((missing_count / total_rows) * 100, 2) if total_rows > 0 else 0.0,
            })
    return report


def _detect_junk_values(df: pd.DataFrame) -> List[dict]:
    """Detect placeholder strings that are really missing values.

    Uses the same token set the cleaner acts on, so the scan cannot promise a
    fix the cleaning step does not perform (or miss one it does).
    """
    findings = []
    for col in df.select_dtypes(include=["object", "category", "string"]).columns:
        sample = df[col].dropna().astype(str).str.strip().str.lower()
        junk_mask = sample.isin(NULL_TOKENS)
        junk_count = int(junk_mask.sum())
        if junk_count > 0:
            findings.append({
                "column": col,
                "junk_count": junk_count,
                "examples": sample[junk_mask].unique().tolist()[:5],
            })
    return findings


def scan_dataset(df: pd.DataFrame) -> dict:
    """Full scan: missing values, junk, type issues, duplicates, outliers."""
    from backend.analysis.adapters import compute_dataset_health, _numeric_columns

    missing = _scan_missing_values_df(df)
    junk = _detect_junk_values(df)
    dups = int(df.duplicated().sum())

    # Keep the scan aligned with health, correlation, and feature discovery:
    # numeric identifiers and single-valued columns are not measurements and
    # should not be reported as meaningful outlier candidates.
    num_cols = _numeric_columns(df)
    outlier_cols = []
    for col in num_cols:
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr = q3 - q1
        if iqr > 0:
            count = int(((df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)).sum())
            if count > 0:
                outlier_cols.append({"column": col, "count": count})

    health = compute_dataset_health(df)

    return {
        "health_before": health,
        "issues": {
            "missing_values": missing,
            "junk_values": junk,
            "duplicates": dups,
            "outliers": outlier_cols,
        }
    }


def clean_dataset(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """
    Apply deterministic cleaning:
      1. Strip whitespace, null out placeholder tokens, infer types
         (delegated to ``column_types.normalize_frame``)
      2. Median/mode/ffill imputation for columns that are mostly present
      3. Drop duplicates
    Returns (cleaned_df, operations_performed, warnings_list).
    """
    operations: List[str] = []
    warnings_list: List[str] = []

    # Measured before anything is imputed or deduplicated. Computing it
    # afterwards (as `len(df) + dup_count`) made the >80%-missing warning below
    # unreachable, because imputation had already filled every gap it looks for.
    original = df
    total_rows_orig = max(len(original), 1)
    pre_missing = {str(c): int(original[c].isnull().sum()) for c in original.columns}
    pre_logical = {str(c): logical_type(original[c]) for c in original.columns}

    # 1. Whitespace, placeholder tokens and type inference — the same code the
    # loader runs, so cleaning and analysis can never disagree about what a
    # column is. It is idempotent, so re-running it on an already-loaded frame
    # is a no-op. Notably absent: the old `.title()` pass, which rewrote every
    # object value in the frame (USA -> Usa, iPhone -> Iphone, AB-12x -> Ab-12X).
    df, report = normalize_frame(original)

    if report.tokens_nulled:
        operations.append(
            f"Converted {report.tokens_nulled} placeholder values "
            "(n/a, NULL, ?, -, …) to proper missing values"
        )
    for col in report.converted_columns:
        info = next((ct for ct in report.column_types if ct.column == col), None)
        if info is not None:
            operations.append(f"Converted '{col}' to {info.logical} ({info.reason})")
    if report.dropped_columns:
        operations.append(
            f"Dropped {len(report.dropped_columns)} empty column(s): "
            f"{', '.join(report.dropped_columns)}"
        )
    if report.dropped_rows:
        operations.append(f"Dropped {report.dropped_rows} completely empty row(s)")

    stripped = [
        ct.column for ct in report.column_types
        if ct.logical in ("categorical", "text") and not ct.dropped
    ]
    if stripped:
        operations.append(
            f"Trimmed surrounding whitespace in {len(stripped)} text column(s)"
        )

    logicals = {ct.column: ct.logical for ct in report.column_types}

    def _skip_impute(col: str) -> bool:
        if logicals.get(str(col)) in _NEVER_IMPUTE:
            return True
        rate = df[col].isnull().mean()
        if rate > _IMPUTE_MAX_MISSING:
            warnings_list.append(
                f"Column '{col}' is {rate * 100:.1f}% missing — left unfilled, because "
                "imputing it would replace real data with a single invented value."
            )
            return True
        return False

    # 2a. Impute numeric columns with skew-aware median/mean
    numeric_cols = [
        c for c in df.select_dtypes(include="number").columns
        if not pd.api.types.is_bool_dtype(df[c]) and logicals.get(str(c)) not in _NEVER_IMPUTE
    ]
    for col in numeric_cols:
        if df[col].isnull().sum() > 0 and not _skip_impute(col):
            valid_vals = df[col].dropna()
            fill_val = valid_vals.median()
            method_name = f"median ({round(float(fill_val), 2)})"
            if pd.notna(fill_val):
                df[col] = df[col].fillna(fill_val)
                operations.append(f"Imputed '{col}' with {method_name}")

    # 2b. Impute categorical columns with mode, or encode high-missing as 'Unknown'
    cat_cols = [
        c for c in df.select_dtypes(include=["object", "category", "string"]).columns
        if logicals.get(str(c)) not in _NEVER_IMPUTE
    ]
    for col in cat_cols:
        n_miss = int(df[col].isnull().sum())
        if n_miss > 0:
            rate = n_miss / total_rows_orig
            if rate > _IMPUTE_MAX_MISSING:
                df[col] = df[col].fillna("Unknown")
                operations.append(
                    f"Encoded high-missing ({rate * 100:.1f}%) column '{col}' with 'Unknown' category ({n_miss} records)"
                )
            else:
                mode_val = df[col].mode(dropna=True)
                fill_val = mode_val[0] if not mode_val.empty else "Missing"
                df[col] = df[col].fillna(fill_val)
                operations.append(f"Imputed '{col}' with mode ('{fill_val}')")

    # 2c. Impute boolean columns with majority value
    for col in df.select_dtypes(include=["bool", "boolean"]).columns:
        if df[col].isnull().sum() > 0 and not _skip_impute(col):
            mode_val = df[col].mode(dropna=True)
            if not mode_val.empty:
                df[col] = df[col].fillna(mode_val[0])
                operations.append(f"Imputed '{col}' with majority value ({mode_val[0]})")

    # 2d. Impute datetime columns with ffill/bfill
    for col in df.select_dtypes(include=["datetime", "datetimetz"]).columns:
        if df[col].isnull().sum() > 0 and not _skip_impute(col):
            df[col] = df[col].ffill().bfill()
            operations.append(f"Forward/back-filled '{col}'")

    # 3. Drop duplicates
    dup_count = int(df.duplicated().sum())
    if dup_count > 0:
        df = df.drop_duplicates().reset_index(drop=True)
        operations.append(f"Removed {dup_count} duplicate rows")

    # 4. SOTA Outlier Treatment: Tukey IQR Winsorization / Capping
    for col in numeric_cols:
        vals = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(vals) >= 4:
            q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr
                outlier_mask = (df[col] < lower_bound) | (df[col] > upper_bound)
                n_capped = int(outlier_mask.sum())
                if n_capped > 0:
                    df[col] = df[col].clip(lower=lower_bound, upper=upper_bound)
                    operations.append(
                        f"Winsorized {n_capped} extreme outlier(s) in '{col}' to Tukey fences [{round(float(lower_bound), 2)}, {round(float(upper_bound), 2)}]"
                    )

    # Warnings measured against the pre-clean frame.
    for col, missing in pre_missing.items():
        if pre_logical.get(col) == "empty":
            continue
        miss_pct = missing / total_rows_orig * 100
        if miss_pct > 80:
            warnings_list.append(
                f"Column '{col}' has {miss_pct:.1f}% missing — consider dropping"
            )

    if not operations:
        operations.append("No changes needed — the dataset was already clean")

    return df, operations, warnings_list


def get_cleaning_summary(df_before: pd.DataFrame, df_after: pd.DataFrame) -> dict:
    """Compute before/after metrics for the cleaning report."""
    from backend.analysis.adapters import compute_dataset_health
    h_before = compute_dataset_health(df_before)
    h_after = compute_dataset_health(df_after)
    orig_rows = int(len(df_before))
    clean_rows = int(len(df_after))
    orig_missing = int(df_before.isnull().sum().sum())
    clean_missing = int(df_after.isnull().sum().sum())
    return {
        "health_before": h_before,
        "health_after": h_after,
        "rows_before": orig_rows,
        "rows_after": clean_rows,
        "original_rows": orig_rows,
        "cleaned_rows": clean_rows,
        "missing_before": orig_missing,
        "missing_after": clean_missing,
        "original_missing": orig_missing,
        "cleaned_missing": clean_missing,
        "rows_removed": int(orig_rows - clean_rows),
        "missing_resolved": int(orig_missing - clean_missing),
        "improvement": round(float(h_after["health_score"] - h_before["health_score"]), 1),
    }
