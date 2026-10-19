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

import tempfile
import pickle
from pathlib import Path

# In-memory store + disk persistence for cross-worker & reboot resilience
_DATASETS: Dict[str, DatasetSession] = {}
_STORAGE_DIR = Path(tempfile.gettempdir()) / "argus_dataset_store"
_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _save_session_to_disk(session: DatasetSession) -> None:
    try:
        file_path = _STORAGE_DIR / f"{session.dataset_id}.pkl"
        with open(file_path, "wb") as f:
            pickle.dump(session, f, protocol=pickle.HIGHEST_PROTOCOL)
    except Exception as e:
        print(f"[DatasetService] Disk persist notice: {e}")


def _load_session_from_disk(dataset_id: str) -> Optional[DatasetSession]:
    try:
        file_path = _STORAGE_DIR / f"{dataset_id}.pkl"
        if file_path.is_file():
            with open(file_path, "rb") as f:
                sess = pickle.load(f)
                _DATASETS[sess.dataset_id] = sess
                return sess
    except Exception as e:
        print(f"[DatasetService] Disk load notice: {e}")
    return None


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
    _save_session_to_disk(session)
    return session


def update_dataset_dataframe(
    dataset_id: str,
    new_df: pd.DataFrame,
    transformation_note: Optional[str] = None,
) -> Optional[dict]:
    """Updates the dataset session with a transformed/cleaned dataframe and refreshes metrics."""
    session = get_dataset(dataset_id)
    if not session or not isinstance(new_df, pd.DataFrame) or new_df.empty:
        return None

    old_cols = list(session.df.columns)
    old_rows = int(len(session.df))

    session.df = new_df.copy()
    session.eda_result = run_eda(new_df, session.dataset_name)

    # Refresh column types
    for col in new_df.columns:
        if str(col) not in session.column_types:
            session.column_types[str(col)] = {
                "column": str(col),
                "dtype": str(new_df[col].dtype),
                "logical": "numeric" if pd.api.types.is_numeric_dtype(new_df[col]) else "categorical",
            }
    session.narrative = None  # Clear cache so fresh narrative is generated
    session._profile_cache = None  # Clear cached profile so fresh profile is computed
    _save_session_to_disk(session)

    new_cols = list(new_df.columns)
    new_rows = int(len(new_df))

    return {
        "dataset_id": dataset_id,
        "rows": new_rows,
        "columns": new_cols,
        "shape": list(new_df.shape),
        "row_delta": new_rows - old_rows,
        "new_columns": [c for c in new_cols if c not in old_cols],
        "dropped_columns": [c for c in old_cols if c not in new_cols],
        "preview": new_df.head(15).to_dict(orient="records"),
        "download_url": f"/api/datasets/{dataset_id}/export",
    }


def get_dataset(dataset_id: str) -> Optional[DatasetSession]:
    """Look up a session by id with multi-layer fallback:
    1. In-memory dictionary
    2. Disk persistence cache
    3. Single active dataset fallback
    4. Most recently updated session on disk
    """
    if not dataset_id:
        return None
    session = _DATASETS.get(dataset_id)
    if session is not None:
        return session
    # 2. Check disk persistence
    session = _load_session_from_disk(dataset_id)
    if session is not None:
        return session
    # 3. Single active dataset in memory
    if len(_DATASETS) == 1:
        return next(iter(_DATASETS.values()))
    # 4. Fallback to latest session on disk
    try:
        all_pkls = sorted(_STORAGE_DIR.glob("*.pkl"), key=os.path.getmtime, reverse=True)
        if all_pkls:
            latest_id = all_pkls[0].stem
            return _load_session_from_disk(latest_id)
    except Exception:
        pass
    return None


def get_profile(dataset_id: str) -> dict:
    session = get_dataset(dataset_id)
    if not session:
        raise ValueError(f"Dataset {dataset_id} not found")
    if getattr(session, "_profile_cache", None) is not None:
        return session._profile_cache
    profile = session.profile()
    profile["health"] = compute_dataset_health(session.df)
    profile["target_variable"] = detect_target_variable(session.df)
    profile["dataset_name"] = session.dataset_name
    profile["overview"] = compute_dataset_overview(session.df)
    profile["capabilities"] = build_analysis_capabilities(session.df)
    cached = sanitize_for_json(profile)
    session._profile_cache = cached
    return cached


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
