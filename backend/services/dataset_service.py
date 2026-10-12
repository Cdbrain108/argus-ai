"""
Dataset service — manages in-memory dataset sessions (spec section 9).
Replaces Streamlit session_state with server-side session storage.
"""
from __future__ import annotations
import os
import uuid
import hashlib
import json
from typing import Dict, Optional

import pandas as pd

from backend.models.dataset import DatasetSession
from backend.analysis.adapters import (
    load_dataset_detailed,
    compute_dataset_health,
    run_eda,
    detect_target_variable,
    build_analysis_capabilities,
    sanitize_for_json,
)
from backend.analysis.overview import compute_dataset_overview

# In-memory store — replace with Redis/Blob in production
_DATASETS: Dict[str, DatasetSession] = {}


def _df_hash(df: pd.DataFrame) -> str:
    return hashlib.md5(pd.util.hash_pandas_object(df).values).hexdigest()[:12]


def create_dataset_session(
    file_content: bytes,
    filename: str,
    dataset_name: Optional[str] = None,
) -> DatasetSession:
    """Load file and create a dataset session."""
    df, report = load_dataset_detailed(file_content, filename)
    dataset_id = str(uuid.uuid4())[:8]

    column_types = {
        str(info["column"]): info
        for info in report.get("column_types", [])
    }
    load_report = {k: v for k, v in report.items() if k != "column_types"}

    session = DatasetSession(
        dataset_id=dataset_id,
        filename=filename,
        original_filename=filename,
        df=df,
        eda_result=run_eda(df, dataset_name),
        # Parenthesised deliberately: `a or b if c else d` binds as
        # `(a or b) if c else d`, which named every unnamed dataset after its
        # own first *column*. The filename stem is the sensible fallback and
        # matches DatasetSession.profile().
        dataset_name=dataset_name or (os.path.splitext(filename)[0] or "dataset"),
        column_types=column_types,
        load_report=load_report,
    )
    _DATASETS[dataset_id] = session
    return session


def get_dataset(dataset_id: str) -> Optional[DatasetSession]:
    """Look up a session by id. Returns None when it genuinely is not there.

    This used to fall back to "the only dataset in memory" when the id was
    unknown, and, on an empty store, to loading a bundled demo CSV and
    registering it under the *requested* id. Both mean a caller asking for
    dataset X is silently handed dataset Y — the wrong data, presented as
    theirs, with no error. The deliberate demo entry point is
    ``POST /api/datasets/demo``.
    """
    return _DATASETS.get(dataset_id)


def get_profile(dataset_id: str) -> dict:
    session = get_dataset(dataset_id)
    if not session:
        raise ValueError(f"Dataset {dataset_id} not found")
    profile = session.profile()
    profile["health"] = compute_dataset_health(session.df)
    profile["target_variable"] = detect_target_variable(session.df)
    profile["dataset_name"] = session.dataset_name
    profile["overview"] = compute_dataset_overview(session.df)
    profile["capabilities"] = build_analysis_capabilities(session.df)
    return sanitize_for_json(profile)


def get_preview(dataset_id: str, n_rows: int = 100) -> dict:
    session = get_dataset(dataset_id)
    if not session:
        raise ValueError(f"Dataset {dataset_id} not found")
    n_rows = max(1, min(int(n_rows), 500))
    df = session.df
    return sanitize_for_json({
        "columns": list(df.columns),
        # df.dtypes, not df.head(1).dtypes: on a one-row slice an all-null
        # column reports object regardless of the column's real dtype.
        "dtypes": {str(c): str(t) for c, t in df.dtypes.items()},
        "logical_types": {
            str(c): session.column_types.get(str(c), {}).get("logical")
            for c in df.columns
        },
        "rows": int(len(df)),
        "preview": df.head(n_rows).to_dict(orient="records"),
    })


def list_datasets() -> list[dict]:
    return [
        {"dataset_id": s.dataset_id, "filename": s.filename, "rows": len(s.df)}
        for s in _DATASETS.values()
    ]
