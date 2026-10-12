"""
Dataset domain model.
Tracks an in-memory dataset session with profiling, health, and analysis history.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import pandas as pd
import hashlib
import json
import os
import tempfile

from backend.analysis.column_types import logical_type


@dataclass
class DatasetSession:
    dataset_id: str
    filename: str
    original_filename: str
    df: pd.DataFrame
    eda_result: dict
    dataset_name: Optional[str] = None
    encoded: bool = False
    cleaning_log: Dict[str, Any] = field(default_factory=dict)
    cleaned_df: Optional[pd.DataFrame] = None
    analysis_history: List[dict] = field(default_factory=list)
    conversation_history: List[dict] = field(default_factory=list)
    #: What the loader decided each column *is*, and what it had to convert to
    #: get there. Keyed by column name; see ``analysis/column_types.ColumnType``.
    column_types: Dict[str, dict] = field(default_factory=dict)
    #: Encoding, delimiter, sheet list, dropped rows/columns, nulled tokens.
    load_report: Dict[str, Any] = field(default_factory=dict)
    #: The AI description the UI types out after upload. Cached because it costs
    #: a model call and never changes for a given upload.
    narrative: Optional[Dict[str, Any]] = None

    def column_summary(self) -> List[dict]:
        rows = []
        for col in self.df.columns:
            info = self.column_types.get(str(col), {})
            sample_vals = [
                str(x) if not pd.isna(x) else "null"
                for x in self.df[col].dropna().head(4).tolist()
            ]
            rows.append({
                "name": col,
                "dtype": str(self.df[col].dtype),
                "missing": int(self.df[col].isnull().sum()),
                "unique": int(self.df[col].nunique(dropna=True)),
                # Surfacing the inferred type and its reason is what makes a
                # silent coercion auditable in the UI instead of invisible.
                "logical_type": info.get("logical"),
                "reason": info.get("reason"),
                "unit": info.get("unit"),
                "converted_from": info.get("converted_from"),
                "confidence": info.get("confidence"),
                "samples": sample_vals,
            })
        return rows

    def profile(self) -> dict:
        df = self.df
        # Use the logical type as the source of truth: a numeric 0/1 flag is
        # deliberately kept numeric for safe computation but should still appear
        # as a boolean in the profile.
        bool_cols = [c for c in df.columns if logical_type(df[c]) == "boolean"]
        num_cols = [
            c for c in df.select_dtypes(include="number").columns.tolist()
            if c not in bool_cols and logical_type(df[c]) not in {"identifier", "constant", "empty"}
        ]
        cat_cols = [
            c for c in df.select_dtypes(include=["object", "category", "string"]).columns.tolist()
            if logical_type(df[c]) not in {"text", "identifier", "constant", "empty"}
        ]
        dt_cols = df.select_dtypes(include=["datetime", "datetimetz"]).columns.tolist()

        by_logical: Dict[str, List[str]] = {}
        for name, info in self.column_types.items():
            if info.get("dropped") or name not in df.columns:
                continue
            by_logical.setdefault(info.get("logical", "unknown"), []).append(name)

        text_cols = by_logical.get("text", [])
        id_cols = by_logical.get("identifier", [])
        const_cols = by_logical.get("constant", [])
        # A key or a single-valued column is object-dtyped but is not a
        # categorical variable; leaving them in that list makes every "pick a
        # category" affordance in the UI offer columns that cannot be analysed.
        cat_cols = [c for c in cat_cols if c not in set(text_cols) | set(id_cols) | set(const_cols)]

        converted = [
            {"column": name, "from": info.get("converted_from"), "to": info.get("logical"),
             "unit": info.get("unit"), "reason": info.get("reason")}
            for name, info in self.column_types.items()
            if info.get("converted_from") and not info.get("dropped")
        ]

        return {
            "dataset_id": self.dataset_id,
            "filename": self.filename,
            "dataset_name": self.dataset_name or os.path.splitext(self.filename)[0],
            "rows": len(df),
            "columns": len(df.columns),
            "numeric_columns": num_cols,
            "categorical_columns": cat_cols,
            "datetime_columns": dt_cols,
            "boolean_columns": bool_cols,
            "text_columns": text_cols,
            "identifier_columns": id_cols,
            "constant_columns": const_cols,
            "missing_total": int(df.isnull().sum().sum()),
            "duplicate_count": int(df.duplicated().sum()),
            "column_summary": self.column_summary(),
            "column_types": self.column_types,
            "converted_columns": converted,
            "load_report": self.load_report,
        }
