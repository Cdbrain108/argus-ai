"""
Analysis adapters — extract pure data-science logic from existing ARGUS modules,
stripping out all Streamlit dependencies.
Each adapter returns a dict compatible with AnalysisResult schema.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
import csv
import io
import base64
import json
import re
import textwrap
from datetime import datetime

try:
    from sklearn.preprocessing import StandardScaler
    from sklearn.decomposition import PCA
    from sklearn.cluster import KMeans
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    _has_sklearn = True
except ImportError:
    _has_sklearn = False

from backend.models.analysis import AnalysisType, VisualizationType
from backend.analysis.column_types import (
    ColumnType,
    NormalizeReport,
    logical_type,
    normalize_frame,
)

# Rendering caps. Statistics are always computed on the full column; only the
# payload shipped to the browser is trimmed.
_SCATTER_POINT_CAP = 2000
_CATEGORY_CAP = 20
_HISTOGRAM_BINS = 20
_TOP_TOKENS = 12

#: Tried in order; the first that decodes the whole file wins. latin-1 is last
#: because it never fails — it maps every byte — so it is the backstop that turns
#: "upload rejected with UnicodeDecodeError" into "upload works".
_ENCODINGS = ("utf-8", "utf-8-sig", "cp1252", "latin-1")
_DELIMITERS = ",;\t|"
_SNIFF_BYTES = 65536

#: Column types that carry no signal and must stay out of correlation, feature
#: importance and target detection.
_NON_ANALYTIC = ("identifier", "constant", "empty")


# ── Dataset loading ────────────────────────────────────────────────────────────

def _decode(file_content: bytes) -> Tuple[str, str]:
    """First encoding that reads the whole file, and its name.

    The name is reported back to the caller rather than discarded: a file that
    only decodes as latin-1 is worth telling the user about, because a mojibake
    category is a data problem they can fix at the source.
    """
    last: Optional[Exception] = None
    for encoding in _ENCODINGS:
        try:
            return file_content.decode(encoding), encoding
        except (UnicodeDecodeError, LookupError) as exc:
            last = exc
    raise ValueError(
        "Could not read the file's text encoding. Re-save it as UTF-8 CSV and try again."
    ) from last


def _sniff_delimiter(text: str) -> str:
    """Detect the field separator so `;`-, tab- and pipe-delimited files work.

    A European CSV read with the wrong separator collapses into a single column,
    which used to look like a broken dataset rather than a parsing problem.
    """
    sample = text[:_SNIFF_BYTES]
    try:
        return csv.Sniffer().sniff(sample, delimiters=_DELIMITERS).delimiter
    except csv.Error:
        pass
    # Sniffer gives up on short or quote-heavy samples; fall back to whichever
    # candidate appears most consistently across the first few lines.
    lines = [ln for ln in sample.splitlines()[:20] if ln.strip()]
    if not lines:
        return ","
    best, best_score = ",", -1.0
    for candidate in _DELIMITERS:
        counts = [ln.count(candidate) for ln in lines]
        if min(counts) < 1:
            continue
        # Reward a high, stable count: real separators appear the same number of
        # times on every row.
        score = min(counts) - (max(counts) - min(counts))
        if score > best_score:
            best, best_score = candidate, float(score)
    return best


def _read_excel(buf: io.BytesIO) -> Tuple[pd.DataFrame, List[str], Optional[str]]:
    """Read the first sheet that actually has rows, and report all sheet names.

    `pd.read_excel(buf)` silently takes sheet 1, so a workbook whose first tab is
    a cover page or an empty template produced an "empty dataset" error while the
    real data sat one tab over.
    """
    sheets = pd.read_excel(buf, sheet_name=None)
    names = [str(n) for n in sheets.keys()]
    for name, frame in sheets.items():
        if not frame.empty and len(frame.columns):
            return frame, names, str(name)
    if sheets:
        first = next(iter(sheets.items()))
        return first[1], names, str(first[0])
    raise ValueError("The workbook has no sheets")


def _read_json(text: str, *, lines: bool = False) -> pd.DataFrame:
    """Read record-oriented JSON while tolerating common wrapper shapes.

    Exports are commonly either JSON Lines, a list of records, or an object
    containing ``data``/``records``/``rows``. ``json_normalize`` flattens nested
    objects into usable columns instead of turning the whole object into one
    opaque text field.
    """
    if lines:
        try:
            frame = pd.read_json(io.StringIO(text), lines=True)
        except ValueError as exc:
            raise ValueError(f"Could not parse JSON Lines data: {exc}") from exc
        return frame

    try:
        payload = json.loads(text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not parse JSON data: {exc}") from exc

    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict):
        records = next(
            (payload[key] for key in ("data", "records", "rows", "items") if isinstance(payload.get(key), list)),
            None,
        )
        if records is None:
            # A column-oriented object such as {"age": [1, 2], "city": [...]}
            # is already a valid table when all lists have the same length.
            list_values = [value for value in payload.values() if isinstance(value, list)]
            if list_values and len({len(value) for value in list_values}) == 1:
                return pd.DataFrame(payload)
            records = [payload]
    else:
        records = [{"value": payload}]

    if not records:
        return pd.DataFrame()
    if all(isinstance(item, dict) for item in records):
        return pd.json_normalize(records, sep=".")
    return pd.DataFrame({"value": records})


def _repair_headers(frame: pd.DataFrame) -> pd.DataFrame:
    """Give every column a usable, unique name."""
    repaired: List[str] = []
    for i, col in enumerate(frame.columns):
        name = str(col).strip()
        # pandas invents `Unnamed: 3` for blank headers, which then shows up in
        # the UI and in LLM prompts as if it were a real field name.
        if not name or re.fullmatch(r"unnamed:?\s*\d*(\.\d+)?", name, re.IGNORECASE):
            name = f"column_{i + 1}"
        repaired.append(name)

    counts: Dict[str, int] = {}
    unique: List[str] = []
    for name in repaired:
        counts[name] = counts.get(name, 0) + 1
        unique.append(name if counts[name] == 1 else f"{name}_{counts[name]}")
    frame.columns = unique
    return frame


def load_dataset_detailed(file_content: bytes, filename: str) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Load a tabular file and return it correctly typed, plus what that took.

    Everything type-related happens here, once, via `normalize_frame`: junk
    tokens become real NaN, text dates become datetimes, `"$1,234.56"` becomes a
    float. Every analysis tool downstream picks its columns with `select_dtypes`,
    so fixing the dtypes at the door is what makes correlation, outliers and
    feature importance start seeing those columns at all.
    """
    if not file_content:
        raise ValueError("Uploaded file is empty")

    name = filename.lower()
    buf = io.BytesIO(file_content)
    sheet_names: List[str] = []
    active_sheet: Optional[str] = None
    delimiter: Optional[str] = None
    encoding: Optional[str] = None

    if name.endswith((".xlsx", ".xls", ".xlsm")):
        try:
            frame, sheet_names, active_sheet = _read_excel(buf)
        except ImportError as exc:  # openpyxl / xlrd missing
            raise ValueError(
                "Reading Excel files needs 'openpyxl' for .xlsx/.xlsm or 'xlrd' for .xls. "
                "Install the matching package, or export the sheet as CSV."
            ) from exc
    elif name.endswith((".csv", ".tsv", ".txt", ".tab", ".psv", ".dat", ".json", ".jsonl")):
        text, encoding = _decode(file_content)
        if name.endswith(".json"):
            frame = _read_json(text)
        elif name.endswith(".jsonl"):
            frame = _read_json(text, lines=True)
        else:
            delimiter = "\t" if name.endswith((".tsv", ".tab")) else _sniff_delimiter(text)
            try:
                frame = pd.read_csv(
                    io.StringIO(text),
                    sep=delimiter,
                    engine="python",        # tolerates ragged rows and odd quoting
                    skip_blank_lines=True,
                    skipinitialspace=True,
                    on_bad_lines="skip",
                    dtype=object,
                    keep_default_na=False,
                )
            except Exception as exc:
                raise ValueError(f"Could not parse the delimited file: {exc}") from exc
    elif name.endswith(".parquet"):
        try:
            frame = pd.read_parquet(buf)
        except ImportError as exc:
            raise ValueError(
                "Reading Parquet files needs the 'pyarrow' or 'fastparquet' package. "
                "Install one, or export the table as CSV."
            ) from exc
        except Exception as exc:
            raise ValueError(f"Could not parse the Parquet file: {exc}") from exc
    else:
        raise ValueError(
            "Unsupported file type. Upload CSV, TSV, delimited TXT, JSON, JSONL, Parquet, or Excel."
        )

    if len(frame.columns) == 0:
        raise ValueError("The uploaded dataset has no columns")

    frame = _repair_headers(frame)
    frame, report = normalize_frame(frame)

    if len(frame.columns) == 0 and len(frame) > 0:
        raise ValueError("Every column in the uploaded dataset was empty")

    meta: Dict[str, Any] = report.to_dict()
    meta.update({
        "filename": filename,
        "delimiter": delimiter,
        "encoding": encoding,
        "sheet_names": sheet_names,
        "active_sheet": active_sheet,
        "rows": int(len(frame)),
        "columns": int(len(frame.columns)),
    })
    return frame, meta


def load_dataset(file_content: bytes, filename: str) -> pd.DataFrame:
    """Load CSV/TSV/Excel from raw bytes, correctly typed.

    Thin wrapper over `load_dataset_detailed` for callers that only want the
    frame; the signature is unchanged from before type inference existed.
    """
    frame, _ = load_dataset_detailed(file_content, filename)
    return frame


# ── Health ─────────────────────────────────────────────────────────────────────

def compute_dataset_health(df: pd.DataFrame) -> dict:
    """Health score (0-100): 100 minus missing, duplicate and outlier penalties.

    Each penalty is the offending percentage doubled and capped. The outlier
    penalty used to be the bare mean percentage with no doubling, so outliers
    counted half as much as the docstring and the UI legend both claimed.
    """
    n_rows = len(df)
    if n_rows == 0 or len(df.columns) == 0:
        # `df.isnull().mean().mean()` is NaN on an empty frame, and NaN
        # propagates straight through to the score the UI renders.
        return {
            "health_score": 0,
            "missing_penalty": 0,
            "duplicate_penalty": 0,
            "outlier_penalty": 0,
            "constant_penalty": 0,
            "breakdown": {
                "missing_values_pct": 0.0,
                "duplicates_count": 0,
                "outliers_count_cols": 0,
                "numerical_columns": 0,
                "constant_columns": 0,
                "empty_dataset": True,
            },
        }

    missing_pct = float(df.isnull().mean().mean() * 100)
    missing_penalty = min(40, round(missing_pct * 2))

    dup_count = int(df.duplicated().sum())
    dup_pct = dup_count / n_rows * 100
    dup_penalty = min(20, round(dup_pct * 2))

    num_cols = _numeric_columns(df)
    outlier_pcts = []
    for col in num_cols:
        values = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(values) < 4:
            continue
        q1, q3 = values.quantile(0.25), values.quantile(0.75)
        iqr = q3 - q1
        if iqr > 0:
            pct = float(((values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)).mean() * 100)
            outlier_pcts.append(pct)
    mean_outlier_pct = sum(outlier_pcts) / len(outlier_pcts) if outlier_pcts else 0.0
    outlier_penalty = min(40, round(mean_outlier_pct * 2))

    # A column with one repeated value can't support any analysis, so it is a
    # genuine defect in the dataset rather than a neutral fact about it.
    constant_cols = [c for c in df.columns if df[c].dropna().nunique() <= 1]
    constant_penalty = min(10, round(len(constant_cols) / len(df.columns) * 20))

    health_score = max(
        0, 100 - missing_penalty - dup_penalty - outlier_penalty - constant_penalty
    )

    return {
        "health_score": health_score,
        "missing_penalty": missing_penalty,
        "duplicate_penalty": dup_penalty,
        "outlier_penalty": outlier_penalty,
        "constant_penalty": constant_penalty,
        "breakdown": {
            "missing_values_pct": round(missing_pct, 1),
            "missing_penalty": missing_penalty,
            "duplicates_count": dup_count,
            "duplicates_pct": round(dup_pct, 1),
            "duplicate_penalty": dup_penalty,
            "mean_outlier_pct": round(mean_outlier_pct, 2),
            "outlier_penalty": outlier_penalty,
            "outliers_count_cols": len(outlier_pcts),
            "numerical_columns": len(num_cols),
            "constant_columns": len(constant_cols),
            "constant_penalty": constant_penalty,
            "constant_column_names": [str(c) for c in constant_cols[:10]],
            "empty_dataset": False,
        },
    }


# ── Column selection helpers ───────────────────────────────────────────────────

def _numeric_columns(df: pd.DataFrame, include_bool: bool = False) -> List[str]:
    """Numeric columns, with identifiers and constants left out.

    Booleans are opt-in: they are meaningful in a correlation matrix (a 0/1 flag
    correlates fine) but meaningless in a histogram of means.
    """
    cols: List[str] = []
    for col in df.columns:
        series = df[col]
        kind = logical_type(series)
        if kind == "boolean":
            if include_bool and series.dropna().nunique() > 1:
                cols.append(str(col))
            continue
        if not pd.api.types.is_numeric_dtype(series):
            continue
        if kind in _NON_ANALYTIC:
            continue
        cols.append(str(col))
    return cols


def _datetime_columns(df: pd.DataFrame) -> List[str]:
    return [str(c) for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]


def _categorical_columns(df: pd.DataFrame, max_levels: int = 30) -> List[str]:
    """Low-cardinality non-numeric columns usable as grouping variables."""
    cols: List[str] = []
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            continue
        if pd.api.types.is_datetime64_any_dtype(series):
            continue
        kind = logical_type(series)
        if kind in ("categorical", "boolean") and 1 < series.dropna().nunique() <= max_levels:
            cols.append(str(col))
    return cols


def _as_float(series: pd.Series) -> pd.Series:
    """Any analysable column as float, so numpy/scipy/sklearn accept it.

    Booleans become 0/1 and datetimes become epoch seconds, which is what lets
    a date column appear in a correlation matrix at all.
    """
    if pd.api.types.is_bool_dtype(series):
        return series.astype("float64")
    if pd.api.types.is_datetime64_any_dtype(series):
        # Pandas also stores dates in microseconds or seconds, not only ns.
        return (series - pd.Timestamp("1970-01-01", tz=series.dt.tz)).dt.total_seconds()
    return pd.to_numeric(series, errors="coerce").astype("float64").replace([np.inf, -np.inf], np.nan)


# ── Column type detection (from univariate.get_col_type) ─────────────────────

def get_col_type(series: pd.Series) -> str:
    """Univariate analysis type for a column.

    Delegates the decision to `column_types.logical_type` and translates it into
    the vocabulary this module has always used, so `registry.py` and
    `report_service.py` keep matching on the strings they already expect while
    gaining `datetime`, `boolean`, `text`, `constant` and `empty`.
    """
    kind = logical_type(series)
    if kind in ("datetime", "boolean", "text", "identifier", "constant", "empty"):
        return kind
    if kind in ("numeric", "integer"):
        return "discrete_numeric" if series.nunique(dropna=True) <= 10 else "continuous"
    return "categorical_low" if series.nunique(dropna=True) <= 15 else "categorical_high"


# ── Univariate analysis ────────────────────────────────────────────────────────

def _resolve_histogram_bins(requested: Any, values: pd.Series) -> int:
    """Bounded Freedman–Diaconis binning; Sturges fallback for zero IQR."""
    if requested not in (None, "", "auto"):
        if isinstance(requested, bool) or not str(requested).isdigit() or not 5 <= int(requested) <= 80:
            raise ValueError("Histogram bins must be 'auto' or an integer from 5 to 80.")
        return int(requested)
    values = _as_float(values).dropna()
    unique = values.nunique()
    if unique <= 1:
        return 1
    spread = float(values.max() - values.min())
    iqr = float(values.quantile(.75) - values.quantile(.25))
    width = 2 * iqr / np.cbrt(len(values))
    estimate = spread / width if width > 0 else np.log2(len(values)) + 1
    return max(1, min(80, unique, int(np.ceil(min(80, estimate)))))


def run_univariate_analysis(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    bins: Any = "auto",
    top_n: int = 20,
    time_bucket: str = "auto",
    text_view: str = "length",
) -> dict:
    """Analyse one or more columns with the method that fits each column's type.

    The branch is chosen from the *dtype*, not from the name-derived type string.
    That ordering is the fix for a 500: a string UUID column named `user_id` was
    classified `identifier`, and `identifier` was routed into the numeric branch,
    where `series.quantile(0.25)` raised `TypeError` on text.
    """
    if columns is None:
        columns = df.columns.tolist()
    if not 1 <= top_n <= 50:
        raise ValueError("Category limit must be between 1 and 50.")
    if time_bucket not in {"auto", "hour", "day", "week", "month", "year"}:
        raise ValueError("Unsupported time bucket.")
    if text_view not in {"length", "tokens"}:
        raise ValueError("Text view must be 'length' or 'tokens'.")
    results: Dict[str, Any] = {}
    total = max(len(df), 1)

    for col in columns:
        raw = df[col]
        series = raw.dropna()
        col_type = get_col_type(raw)
        missing = int(raw.isnull().sum())
        entry: Dict[str, Any] = {
            "type": col_type,
            "column": str(col),
            "dtype": str(raw.dtype),
            "count": int(len(series)),
            "missing": missing,
            "missing_pct": round(missing / total * 100, 2),
            "unique": int(raw.nunique(dropna=True)),
        }

        if len(series) == 0:
            entry["analysis_skipped"] = "empty"
            entry["note"] = "Every value in this column is missing, so there is nothing to summarise."
        elif col_type == "constant":
            entry["analysis_skipped"] = "constant"
            entry["note"] = (
                "This column contains one repeated value, so a distribution chart "
                "would not provide a meaningful comparison."
            )
        elif col_type == "boolean":
            _describe_boolean(entry, series, str(col))
        elif pd.api.types.is_datetime64_any_dtype(raw):
            _describe_datetime(entry, series, str(col), time_bucket=time_bucket)
        elif pd.api.types.is_bool_dtype(raw):
            _describe_boolean(entry, series, str(col))
        elif col_type == "identifier":
            _describe_identifier(entry, series, str(col))
        elif pd.api.types.is_numeric_dtype(raw):
            _describe_numeric(entry, _as_float(series).dropna(), str(col), bins=bins)
        elif col_type == "text":
            _describe_text(entry, series, str(col), bins=bins)
            if text_view == "tokens" and entry.get("top_tokens"):
                entry["chart"] = {
                    "type": "bar", "xLabel": f"{col} (tokens)", "yLabel": "Token occurrences",
                    "labels": [t["value"] for t in entry["top_tokens"]],
                    "values": [t["count"] for t in entry["top_tokens"]],
                }
        else:
            _describe_categorical(entry, raw, str(col), top_n=top_n)

        entry["health"] = _column_health(entry)
        results[col] = entry
    return results


def _describe_numeric(entry: Dict[str, Any], series: pd.Series, col: str, bins: Any = "auto") -> None:
    """Distribution statistics plus the transform hints an analyst would want."""
    if len(series) == 0:
        entry["analysis_skipped"] = "no numeric values"
        return
    q1 = float(series.quantile(0.25))
    q3 = float(series.quantile(0.75))
    iqr = q3 - q1
    outliers = int(((series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)).sum()) if iqr > 0 else 0
    mode = series.mode()
    skew = float(series.skew()) if len(series) > 2 else None

    entry.update({
        "mean": _round_or_none(series.mean()),
        "median": _round_or_none(series.median()),
        "mode": _round_or_none(mode.iloc[0]) if len(mode) else None,
        "std": _round_or_none(series.std()) if len(series) > 1 else None,
        "variance": _round_or_none(series.var()) if len(series) > 1 else None,
        "min": _round_or_none(series.min()),
        "max": _round_or_none(series.max()),
        "range": _round_or_none(series.max() - series.min()),
        "sum": _round_or_none(series.sum()),
        "q1": _round_or_none(q1),
        "q3": _round_or_none(q3),
        "iqr": _round_or_none(iqr),
        "p05": _round_or_none(series.quantile(0.05)),
        "p95": _round_or_none(series.quantile(0.95)),
        "skew": _round_or_none(skew),
        "kurtosis": _round_or_none(series.kurtosis()) if len(series) > 3 else None,
        "outliers": outliers,
        "outlier_pct": round(outliers / max(len(series), 1) * 100, 2),
        "zeros": int((series == 0).sum()),
        "negatives": int((series < 0).sum()),
    })

    # Coefficient of variation is only meaningful away from a zero mean.
    mean_val = float(series.mean())
    if abs(mean_val) > 1e-9 and len(series) > 1:
        entry["cv"] = _round_or_none(float(series.std()) / abs(mean_val))

    entry["normality"] = _normality(series)
    if skew is not None and abs(skew) > 1:
        direction = "right" if skew > 0 else "left"
        hint = f"Distribution is {direction}-skewed (skew = {skew:.2f})."
        if skew > 1 and float(series.min()) >= 0:
            hint += " A log transform would make it closer to symmetric."
        entry["transform_hint"] = hint

    bin_count = _resolve_histogram_bins(bins, series)
    counts, edges = np.histogram(series.to_numpy(dtype="float64"), bins=bin_count)
    entry["chart"] = {
        "type": "histogram",
        # One label per bar: the bin's left edge. np.histogram returns
        # len(counts)+1 edges, so the last edge is dropped deliberately.
        "labels": edges[:-1].tolist(),
        "edges": edges.tolist(),
        "values": counts.tolist(),
        "bins": bin_count,
        "xLabel": col,
        "yLabel": "Frequency",
    }


def _normality(series: pd.Series) -> Dict[str, Any]:
    """Shapiro-Wilk on a capped sample; the test is unusable on huge n.

    Above a few thousand rows Shapiro-Wilk rejects normality for trivially small
    deviations, so a sample keeps the verdict informative rather than always
    'not normal'.
    """
    try:
        from scipy.stats import shapiro
    except ImportError:
        return {"test": None, "note": "scipy not installed"}
    values = series.dropna()
    if len(values) < 8:
        return {"test": "shapiro", "note": "too few values to test"}
    sample = values.sample(5000, random_state=0) if len(values) > 5000 else values
    try:
        stat, p_value = shapiro(sample.to_numpy(dtype="float64"))
    except Exception:
        return {"test": "shapiro", "note": "test could not be computed"}
    return {
        "test": "shapiro",
        "statistic": round(float(stat), 4),
        "p_value": round(float(p_value), 6),
        "sampled": int(len(sample)),
        "is_normal": bool(p_value > 0.05),
        "note": (
            "Consistent with a normal distribution (p > 0.05)."
            if p_value > 0.05 else
            "Significantly different from normal (p <= 0.05); prefer median and IQR."
        ),
    }


def _bucket_for_span(days: float) -> Tuple[str, str]:
    """Resample rule and label chosen from how much time the column covers."""
    if days <= 2:
        return "h", "hour"
    if days <= 90:
        return "D", "day"
    if days <= 730:
        return "W", "week"
    if days <= 3650:
        return "ME", "month"
    return "YE", "year"


def _describe_datetime(entry: Dict[str, Any], series: pd.Series, col: str, time_bucket: str = "auto") -> None:
    """Range, regularity and gaps — then a time-series count chart.

    Nothing in this package used to consume datetimes at all: `profile()`
    reported a `datetime_columns` list that was always empty because no column
    ever reached `datetime64` dtype.
    """
    ordered = series.sort_values()
    first, last = ordered.iloc[0], ordered.iloc[-1]
    span = last - first
    span_days = float(span.total_seconds() / 86400)

    entry.update({
        "min": str(first),
        "max": str(last),
        "span_days": round(span_days, 2),
        "span_human": _humanize_span(span_days),
        "is_monotonic": bool(ordered.is_monotonic_increasing and series.is_monotonic_increasing),
        "has_time_component": bool((series.dt.hour.ne(0) | series.dt.minute.ne(0) | series.dt.second.ne(0)).any()),
        "duplicate_timestamps": int(len(series) - series.nunique()),
    })

    try:
        inferred = pd.infer_freq(pd.DatetimeIndex(ordered.unique())) if series.nunique() > 2 else None
    except (ValueError, TypeError):
        inferred = None
    entry["inferred_frequency"] = inferred

    # Gaps: consecutive observations more than three times the typical step
    # apart. This is what flags a sensor outage or a missing reporting month.
    unique_sorted = pd.Series(sorted(series.unique()))
    if len(unique_sorted) > 2:
        deltas = unique_sorted.diff().dropna()
        median_step = deltas.median()
        if pd.notna(median_step) and median_step.total_seconds() > 0:
            gaps = deltas[deltas > median_step * 3]
            entry["median_step"] = _humanize_span(float(median_step.total_seconds() / 86400))
            entry["gap_count"] = int(len(gaps))
            if len(gaps):
                entry["largest_gap"] = _humanize_span(float(gaps.max().total_seconds() / 86400))
            expected = span / median_step + 1
            if expected > 0:
                entry["coverage_pct"] = round(min(100.0, len(unique_sorted) / float(expected) * 100), 2)

    rule, label = _bucket_for_span(span_days)
    if time_bucket != "auto":
        rule, label = {"hour": ("h", "hour"), "day": ("D", "day"), "week": ("W", "week"),
                       "month": ("ME", "month"), "year": ("YE", "year")}[time_bucket]
    counts = series.groupby(series.dt.to_period(_PERIOD_ALIASES[rule])).size()
    counts = counts.sort_index()
    entry["bucket"] = label
    entry["chart_note"] = (
        f"Record counts per {label}; showing the latest 500 of {len(counts)} observed buckets."
        if len(counts) > 500 else f"Record counts per {label}; only observed buckets are plotted."
    )
    entry["chart"] = {
        "type": "line",
        "labels": [str(idx) for idx in counts.index][-500:],
        "values": [int(v) for v in counts.to_numpy()][-500:],
        "xLabel": f"{col} (by {label})",
        "yLabel": "Records",
        "note": entry["chart_note"],
    }

    # A weekday/hour profile answers "when does this happen" in a way the
    # overall trend line cannot.
    if span_days > 6:
        weekday = series.dt.day_name().value_counts()
        order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        entry["weekday_distribution"] = [
            {"value": day, "count": int(weekday.get(day, 0))} for day in order
        ]
    if entry.get("has_time_component"):
        hourly = series.dt.hour.value_counts().sort_index()
        entry["hour_distribution"] = [
            {"value": f"{int(h):02d}:00", "count": int(c)} for h, c in hourly.items()
        ]


#: `to_period` uses its own alias spelling, which differs from the resample rule.
_PERIOD_ALIASES = {"h": "h", "D": "D", "W": "W", "ME": "M", "YE": "Y"}


def _humanize_span(days: float) -> str:
    if days < 1:
        hours = days * 24
        return f"{hours:.1f} hours" if hours >= 1 else f"{hours * 60:.0f} minutes"
    if days < 60:
        return f"{days:.0f} days"
    if days < 730:
        return f"{days / 30.44:.1f} months"
    return f"{days / 365.25:.1f} years"


def _describe_boolean(entry: Dict[str, Any], series: pd.Series, col: str) -> None:
    """True/false counts and the class balance a model would care about.

    Boolean columns used to be invisible: `select_dtypes(include="number")`
    excludes them, so they appeared in neither the numeric nor the categorical
    column list in the profile.
    """
    as_bool = series.astype("boolean")
    true_count = int((as_bool == True).sum())   # noqa: E712 — nullable boolean needs ==
    false_count = int((as_bool == False).sum())  # noqa: E712
    valid = true_count + false_count
    true_pct = (true_count / valid * 100) if valid else 0.0
    minority = min(true_count, false_count)
    majority = max(true_count, false_count)

    entry.update({
        "true_count": true_count,
        "false_count": false_count,
        "true_pct": round(true_pct, 2),
        "false_pct": round(100 - true_pct, 2) if valid else 0.0,
        "mode": "True" if true_count >= false_count else "False",
        "mode_frequency": majority,
        "imbalance_ratio": round(majority / minority, 2) if minority else None,
        "is_balanced": bool(minority and majority / minority <= 1.5),
    })
    if minority == 0:
        entry["note"] = "Only one of the two values ever occurs, so this column carries no signal."
    elif majority / max(minority, 1) > 9:
        entry["note"] = (
            f"Heavily imbalanced ({true_pct:.1f}% true). Accuracy will be misleading "
            "if this is used as a classification target."
        )
    entry["top_values"] = [
        {"value": "True", "count": true_count},
        {"value": "False", "count": false_count},
    ]
    entry["chart"] = {
        "type": "bar",
        "labels": ["True", "False"],
        "values": [true_count, false_count],
        "xLabel": col,
        "yLabel": "Count",
    }


def _describe_identifier(entry: Dict[str, Any], series: pd.Series, col: str) -> None:
    """Report key quality instead of statistics that would be meaningless.

    A histogram of a primary key is a flat uniform bar chart that tells the user
    nothing, so no chart is produced at all.
    """
    duplicated = series[series.duplicated(keep=False)]
    collisions = duplicated.value_counts().head(5)
    entry.update({
        "analysis_skipped": "identifier",
        "is_unique": bool(series.nunique() == len(series)),
        "uniqueness_pct": round(series.nunique() / max(len(series), 1) * 100, 2),
        "duplicate_keys": int(series.duplicated().sum()),
        "example_collisions": [
            {"value": str(value), "count": int(count)} for value, count in collisions.items()
        ],
        "sample_values": [str(v) for v in series.head(5)],
        "note": (
            f"'{col}' looks like a key: {entry['unique']} distinct values across "
            f"{len(series)} rows. It is excluded from statistics, correlation and "
            "feature importance because a row label has no distribution to describe."
        ),
    })


def _describe_categorical(entry: Dict[str, Any], raw: pd.Series, col: str, top_n: int = 20) -> None:
    """Level frequencies plus concentration and rare-level diagnostics."""
    vc_all = raw.value_counts(dropna=True)
    vc = vc_all.head(top_n)
    valid = int(vc_all.sum())

    entry["mode"] = str(vc.index[0]) if len(vc) > 0 else None
    entry["mode_frequency"] = int(vc.iloc[0]) if len(vc) > 0 else 0
    entry["mode_pct"] = round(float(vc.iloc[0]) / valid * 100, 2) if len(vc) and valid else 0.0
    entry["unique_count"] = int(raw.nunique(dropna=True))
    entry["levels"] = int(len(vc_all))
    entry["top_values"] = [
        {"value": str(index), "count": int(count), "pct": round(count / valid * 100, 2) if valid else 0.0}
        for index, count in vc.items()
    ]
    if len(vc_all) > top_n:
        entry["other_levels"] = int(len(vc_all) - top_n)
        entry["other_count"] = int(vc_all.iloc[top_n:].sum())

    if valid:
        proportions = (vc_all / valid).to_numpy(dtype="float64")
        # Shannon entropy, normalised so 0 = one dominant level and 1 = perfectly
        # even. This is the concentration number a top-5 table can't show.
        log_proportions = np.zeros_like(proportions)
        np.log2(proportions, out=log_proportions, where=proportions > 0)
        entropy = float(-(proportions * log_proportions).sum())
        max_entropy = float(np.log2(len(vc_all))) if len(vc_all) > 1 else 0.0
        entry["entropy"] = round(entropy, 4)
        entry["normalized_entropy"] = round(entropy / max_entropy, 4) if max_entropy > 0 else 0.0
        entry["top5_coverage_pct"] = round(float(vc_all.head(5).sum()) / valid * 100, 2)
        rare = vc_all[vc_all / valid < 0.01]
        entry["rare_levels"] = int(len(rare))
        entry["rare_level_rows"] = int(rare.sum())
        if len(rare) > 0 and len(rare) / len(vc_all) > 0.5:
            entry["note"] = (
                f"{len(rare)} of {len(vc_all)} levels appear in under 1% of rows. "
                "Grouping them into 'Other' will make charts and models more stable."
            )
        elif len(vc_all) > 50:
            entry["note"] = (
                f"High cardinality ({len(vc_all)} levels). One-hot encoding this "
                "would add that many columns; consider target or frequency encoding."
            )

    entry["chart"] = {
        "type": "bar",
        "labels": [str(i) for i in vc.index.tolist()],
        "values": [int(v) for v in vc.values.tolist()],
        "xLabel": col,
        "yLabel": "Count",
        "note": f"Showing {len(vc)} of {len(vc_all)} levels; {valid - int(vc.sum())} records in other levels.",
    }


def _describe_text(entry: Dict[str, Any], series: pd.Series, col: str, bins: Any = "auto") -> None:
    """Free text gets length statistics and token frequencies, not a bar of 900 levels."""
    txt = series.astype("string").str.strip()
    lengths = txt.str.len().dropna()
    words = txt.str.split().str.len().dropna()

    entry.update({
        "analysis_kind": "text",
        "distinct_ratio": round(series.nunique() / max(len(series), 1), 4),
        "empty_strings": int((txt == "").sum()),
        "mean_chars": _round_or_none(lengths.mean()) if len(lengths) else None,
        "median_chars": _round_or_none(lengths.median()) if len(lengths) else None,
        "min_chars": int(lengths.min()) if len(lengths) else None,
        "max_chars": int(lengths.max()) if len(lengths) else None,
        "mean_words": _round_or_none(words.mean()) if len(words) else None,
        "max_words": int(words.max()) if len(words) else None,
        "mode": str(series.mode().iloc[0]) if len(series.mode()) else None,
        "sample_values": [str(v)[:120] for v in series.head(3)],
        "note": (
            f"'{col}' is free text ({entry['unique']} distinct values). Summarised by "
            "length and word frequency; it is excluded from correlation and modelling "
            "unless you encode it first."
        ),
    })

    tokens = (txt.str.lower()
                 .str.replace(r"[^a-z0-9\s]", " ", regex=True)
                 .str.split()
                 .explode()
                 .dropna())
    tokens = tokens[tokens.str.len() > 2]
    if len(tokens):
        top = tokens.value_counts().head(_TOP_TOKENS)
        entry["top_tokens"] = [{"value": str(t), "count": int(c)} for t, c in top.items()]

    if len(lengths):
        bin_count = _resolve_histogram_bins(bins, lengths)
        counts, edges = np.histogram(lengths.to_numpy(dtype="float64"), bins=bin_count)
        entry["chart"] = {
            "type": "histogram",
            "labels": [round(float(edge), 1) for edge in edges[:-1]],
            "edges": [round(float(edge), 1) for edge in edges],
            "values": counts.tolist(),
            "bins": bin_count,
            "xLabel": f"{col} (characters)",
            "yLabel": "Frequency",
        }


def _column_health(entry: Dict[str, Any]) -> int:
    """Per-column 0-100 score, mirroring the dataset-level penalty scheme."""
    score = 100.0
    score -= min(50.0, entry.get("missing_pct", 0) * 2)
    score -= min(30.0, entry.get("outlier_pct", 0) * 2)
    if entry.get("count", 0) and entry.get("unique") == 1:
        score -= 20  # a constant column carries no information
    return max(0, int(round(score)))


def classify_column_role(series: pd.Series) -> str:
    """Classify a column into its statistical role, for bivariate chart selection.

    Roles:
      - 'identifier'       key or row index — binned, never plotted directly
      - 'datetime'         time axis
      - 'binary'           exactly two distinct values (including booleans)
      - 'categorical'      discrete groups, low cardinality
      - 'continuous'       numeric measurement
      - 'high_cardinality' non-numeric with many distinct values (incl. free text)
      - 'constant'         one repeated value
      - 'empty'            no values at all

    Booleans map onto 'binary' and text onto 'high_cardinality' deliberately, so
    the existing scenario dispatch in `run_bivariate_analysis` keeps working
    without having to enumerate the new logical types.
    """
    kind = logical_type(series)
    if kind in ("constant", "empty", "identifier", "datetime"):
        return kind
    if kind == "boolean":
        return "binary"
    if kind == "text":
        return "high_cardinality"

    n_unique = int(series.dropna().nunique())
    if kind in ("numeric", "integer"):
        # Few observations do not turn ages or prices into category codes.
        return "continuous"
    if n_unique == 2:
        return "binary"
    return "categorical" if n_unique <= 15 else "high_cardinality"


def _chi_square_test(frame: pd.DataFrame, col_a: str, col_b: str) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """Return (chi2, p_value, cramers_v) for contingency table of two categorical columns."""
    try:
        from scipy.stats import chi2_contingency
        ct = pd.crosstab(frame[col_a], frame[col_b])
        if ct.shape[0] < 2 or ct.shape[1] < 2:
            return None, None, None
        chi2, p_val, dof, _ = chi2_contingency(ct)
        if np.isnan(chi2):
            return None, None, None
        n = ct.sum().sum()
        min_dim = min(ct.shape) - 1
        cv = np.sqrt(chi2 / (n * min_dim)) if n > 0 and min_dim > 0 else 0.0
        return round(float(chi2), 4), round(float(p_val), 6), round(float(cv), 4)
    except Exception:
        return None, None, None


# ── Bivariate analysis ──────────────────────────────────────────────────────────

_BIVARIATE_AGGREGATIONS = {"auto", "mean", "median", "count", "sum"}


def _resolve_aggregation(series: pd.Series, requested: str) -> Tuple[str, str]:
    """Choose a safe summary for grouped numeric values.

    ``auto`` prefers median for strongly skewed or outlier-heavy measures and
    mean for stable measures. This keeps a group chart representative for fields
    such as income, age, spend, and duration without making the user understand
    robust statistics before they can explore the data.
    """
    requested = requested if requested in _BIVARIATE_AGGREGATIONS else "auto"
    if requested != "auto":
        return requested, f"user selected {requested}"

    values = _as_float(series).dropna()
    if len(values) < 3:
        return "mean", "too few values to estimate skew reliably, so mean was used"

    skew = float(values.skew()) if len(values) > 2 else 0.0
    q1, q3 = values.quantile(0.25), values.quantile(0.75)
    iqr = q3 - q1
    outlier_rate = float(
        ((values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)).mean()
    ) if iqr > 0 else 0.0
    if abs(skew) > 1 or outlier_rate >= 0.05:
        return "median", (
            f"auto selected median because the measure is {'skewed' if abs(skew) > 1 else 'outlier-heavy'} "
            f"(skew {skew:.2f}, IQR outliers {outlier_rate * 100:.1f}%)"
        )
    return "mean", f"auto selected mean because the distribution is relatively stable (skew {skew:.2f})"


def _aggregate_grouped(grouped_values, aggregation: str):
    if aggregation == "median":
        return grouped_values.median()
    if aggregation == "sum":
        return grouped_values.sum()
    if aggregation == "count":
        return grouped_values.size()
    return grouped_values.mean()


def run_bivariate_analysis(
    df: pd.DataFrame,
    col_a: str,
    col_b: str,
    aggregation: str = "auto",
) -> dict:
    """Dataset-agnostic bivariate analysis with intelligent chart selection.

    ``aggregation`` applies when one variable is a grouping axis and the other
    is a numeric/boolean measure. Numeric-vs-numeric remains a scatter plot and
    categorical-vs-categorical remains a count comparison because aggregating
    those pairs would change their meaning.
    """
    from scipy.stats import pearsonr, spearmanr

    if col_a == col_b:
        raise ValueError("Select two different columns for a relationship analysis.")
    missing = [c for c in (col_a, col_b) if c not in df.columns]
    if missing:
        raise ValueError(f"Unknown columns: {missing}")
    requested_aggregation = str(aggregation or "auto").strip().lower()
    if requested_aggregation not in _BIVARIATE_AGGREGATIONS:
        requested_aggregation = "auto"

    paired = df[[col_a, col_b]].copy()
    for col in (col_a, col_b):
        if pd.api.types.is_numeric_dtype(paired[col]):
            paired[col] = _as_float(paired[col])
    paired = paired.dropna()
    a, b = paired[col_a], paired[col_b]
    n = len(paired)

    result: Dict[str, Any] = {
        "columns": [col_a, col_b],
        "sample_size": n,
        "statistics": {},
        "warnings": [],
        "aggregation_requested": requested_aggregation,
    }
    if aggregation and str(aggregation).strip().lower() not in _BIVARIATE_AGGREGATIONS:
        result["warnings"].append(
            f"Unknown aggregation '{aggregation}'. Auto selection was used instead."
        )

    if n < 2:
        result["statistics"] = {"sample_size": n}
        result["warnings"] = ["Insufficient common data points (less than 2 rows)."]
        result["visualization"] = {"type": "bar", "data": {"labels": [], "values": [], "xLabel": col_a, "yLabel": col_b}}
        return result

    role_a = classify_column_role(a)
    role_b = classify_column_role(b)

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO 0a: A CONSTANT OR EMPTY COLUMN — no relationship can exist
    # ──────────────────────────────────────────────────────────────────────────
    if role_a in ("constant", "empty") or role_b in ("constant", "empty"):
        flat_col = col_a if role_a in ("constant", "empty") else col_b
        flat_role = role_a if role_a in ("constant", "empty") else role_b
        reason = (
            f"'{flat_col}' has no values at all"
            if flat_role == "empty" else
            f"'{flat_col}' holds a single repeated value"
        )
        result["statistics"] = {"sample_size": n, "degenerate_column": flat_col}
        result["warnings"].append(
            f"{reason}, so there is no relationship to measure. Every statistic would be "
            "undefined or zero by construction."
        )
        result["methodology"] = f"Comparison skipped: {reason}."
        result["visualization"] = {
            "type": "bar",
            "data": {"labels": [], "values": [], "xLabel": col_a, "yLabel": col_b},
        }
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO 0b: A DATETIME AXIS -> TIME SERIES
    # Before type inference landed no column ever reached datetime64 dtype, so
    # this branch was unreachable and dates fell through to a 900-category bar.
    # ──────────────────────────────────────────────────────────────────────────
    if role_a == "datetime" or role_b == "datetime":
        if role_a == "datetime" and role_b == "datetime":
            # Two time columns: the interesting quantity is the lag between them.
            delta_days = (b - a).dt.total_seconds() / 86400
            ordered = a.sort_values()
            rule, label = _bucket_for_span(
                float((ordered.iloc[-1] - ordered.iloc[0]).total_seconds() / 86400)
            )
            duration_aggregation, aggregation_reason = _resolve_aggregation(
                delta_days, requested_aggregation
            )
            if requested_aggregation == "count":
                grouped = delta_days.groupby(a.dt.to_period(_PERIOD_ALIASES[rule])).size()
            else:
                grouped = _aggregate_grouped(
                    delta_days.groupby(a.dt.to_period(_PERIOD_ALIASES[rule])),
                    duration_aggregation,
                )
            grouped = grouped.sort_index()
            result["statistics"] = {
                "sample_size": n,
                "relationship": "duration",
                "aggregation_requested": requested_aggregation,
                "aggregation_used": "count" if requested_aggregation == "count" else duration_aggregation,
                "aggregation_reason": aggregation_reason,
                "mean_gap_days": _round_or_none(delta_days.mean()),
                "median_gap_days": _round_or_none(delta_days.median()),
                "min_gap_days": _round_or_none(delta_days.min()),
                "max_gap_days": _round_or_none(delta_days.max()),
                "negative_gaps": int((delta_days < 0).sum()),
            }
            if int((delta_days < 0).sum()):
                result["warnings"].append(
                    f"{int((delta_days < 0).sum())} rows have '{col_b}' before '{col_a}', "
                    "which usually means the two dates are swapped or one is invalid."
                )
            result["methodology"] = (
                f"Both columns are dates, so the elapsed time from '{col_a}' to '{col_b}' "
                f"is summarised using {result['statistics']['aggregation_used']} by {label}."
            )
            result["visualization"] = {
                "type": "line",
                "data": {
                    "labels": [str(i) for i in grouped.index][-500:],
                    "values": [_round_or_none(v) for v in grouped.to_numpy()][-500:],
                    "xLabel": f"{col_a} (by {label})",
                    "yLabel": f"{result['statistics']['aggregation_used'].title()} days to {col_b}",
                },
            }
            return result

        time_col, other_col = (col_a, col_b) if role_a == "datetime" else (col_b, col_a)
        time_series, other_series = (a, b) if role_a == "datetime" else (b, a)
        other_role = role_b if role_a == "datetime" else role_a

        ordered = time_series.sort_values()
        span_days = float((ordered.iloc[-1] - ordered.iloc[0]).total_seconds() / 86400)
        rule, label = _bucket_for_span(span_days)
        periods = time_series.dt.to_period(_PERIOD_ALIASES[rule])

        other_numeric = pd.api.types.is_numeric_dtype(other_series) or \
            pd.api.types.is_bool_dtype(other_series)
        if other_numeric and other_role != "identifier":
            numeric_other = _as_float(other_series)
            aggregate, aggregation_reason = _resolve_aggregation(numeric_other, requested_aggregation)
            if aggregate == "count":
                grouped = numeric_other.groupby(periods).size().sort_index()
                y_label = "Records"
            else:
                grouped = _aggregate_grouped(numeric_other.groupby(periods), aggregate).sort_index()
                y_label = f"{aggregate.title()} of {other_col}"
        else:
            grouped = other_series.groupby(periods).size().sort_index()
            y_label = f"Records"
            aggregate = "count"
            aggregation_reason = "count is the meaningful summary for a non-numeric value"

        stats: Dict[str, Any] = {
            "sample_size": n,
            "relationship": "time_series",
            "time_column": time_col,
            "value_column": other_col,
            "aggregation_requested": requested_aggregation,
            "aggregation_used": aggregate,
            "aggregation_reason": aggregation_reason,
            "bucket": label,
            "buckets": int(len(grouped)),
            "period_start": str(ordered.iloc[0]),
            "period_end": str(ordered.iloc[-1]),
            "aggregate": f"{aggregate} of {other_col} by {label}",
        }

        # An OLS fit over the bucketed series is what turns "here is a wiggly
        # line" into "this is trending up by X per period".
        if aggregate == "mean" and len(grouped.dropna()) >= 3:
            y = grouped.dropna().to_numpy(dtype="float64")
            x = np.arange(len(y), dtype="float64")
            slope, intercept = np.polyfit(x, y, 1)
            try:
                r_trend, p_trend = pearsonr(x, y)
            except Exception:
                r_trend, p_trend = None, None
            stats.update({
                "trend_slope_per_period": round(float(slope), 6),
                "trend_intercept": round(float(intercept), 6),
                "trend_r": round(float(r_trend), 4) if r_trend is not None else None,
                "p_value": round(float(p_trend), 6) if p_trend is not None else None,
                "trend_direction": "increasing" if slope > 0 else ("decreasing" if slope < 0 else "flat"),
                "first_value": _round_or_none(y[0]),
                "last_value": _round_or_none(y[-1]),
                "change": _round_or_none(y[-1] - y[0]),
            })
            if abs(y[0]) > 1e-9:
                stats["change_pct"] = round(float((y[-1] - y[0]) / abs(y[0]) * 100), 2)

        result["statistics"] = stats
        result["methodology"] = (
            f"'{time_col}' spans {_humanize_span(span_days)}, so records were bucketed by "
            f"{label} and the {aggregate} of '{other_col}' plotted over time"
            + (" with an OLS trend fit." if "trend_slope_per_period" in stats else ".")
        )
        if len(grouped) > 500:
            result["warnings"].append(
                f"{len(grouped)} {label} buckets; showing the most recent 500."
            )
        result["visualization"] = {
            "type": "line",
            "data": {
                "labels": [str(i) for i in grouped.index][-500:],
                "values": [_round_or_none(v) for v in grouped.to_numpy()][-500:],
                "xLabel": f"{time_col} (by {label})",
                "yLabel": y_label,
                "trend": (
                    {"slope": stats["trend_slope_per_period"], "intercept": stats["trend_intercept"]}
                    if "trend_slope_per_period" in stats else None
                ),
            },
        }
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO 1: IDENTIFIER DETECTED (e.g. PassengerId, CustomerID, OrderNo)
    # ──────────────────────────────────────────────────────────────────────────
    if role_a == "identifier" or role_b == "identifier":
        id_col, target_col = (col_a, col_b) if role_a == "identifier" else (col_b, col_a)
        id_series, target_series = (a, b) if role_a == "identifier" else (b, a)
        target_is_numeric = pd.api.types.is_numeric_dtype(target_series)

        # `qcut` needs a numeric key, so a UUID or SKU identifier cannot be
        # binned by sequence at all — it has no order to drift along.
        if not pd.api.types.is_numeric_dtype(id_series):
            result["statistics"] = {"sample_size": n, "identifier_column": id_col}
            result["warnings"].append(
                f"'{id_col}' is a non-numeric key ({id_series.nunique()} distinct values), "
                "so it has no sequence to compare against. Pick a descriptive column instead."
            )
            result["methodology"] = f"Comparison skipped: '{id_col}' is a non-ordinal key."
            result["visualization"] = {
                "type": "bar",
                "data": {"labels": [], "values": [], "xLabel": col_a, "yLabel": col_b},
            }
            return result

        if target_is_numeric and target_series.nunique() > 1:
            n_bins = min(10, max(2, n // 10))
            try:
                binned, bin_edges = pd.qcut(id_series, q=n_bins, duplicates="drop", retbins=True)
                id_aggregation, aggregation_reason = _resolve_aggregation(
                    target_series, requested_aggregation
                )
                grouped_values = target_series.groupby(binned, observed=False)
                grouped_means = (
                    grouped_values.size()
                    if id_aggregation == "count"
                    else _aggregate_grouped(grouped_values, id_aggregation)
                )
                grouped_counts = target_series.groupby(binned, observed=False).count()

                labels = []
                for i in range(len(bin_edges) - 1):
                    low, high = bin_edges[i], bin_edges[i + 1]
                    labels.append(f"Q{i + 1} ({low:.0f}-{high:.0f})")
                if len(labels) != len(grouped_means):
                    labels = [f"Q{i + 1}" for i in range(len(grouped_means))]

                values = [_round_or_none(v) for v in grouped_means.values]

                try:
                    r_drift, p_drift = pearsonr(id_series.astype(float), target_series.astype(float))
                except Exception:
                    r_drift, p_drift = None, None

                result["statistics"] = {
                    "sample_size": n,
                    "is_identifier_binned": True,
                    "identifier_column": id_col,
                    "target_column": target_col,
                    "num_bins": len(labels),
                    "aggregation_requested": requested_aggregation,
                    "aggregation_used": id_aggregation,
                    "aggregation_reason": aggregation_reason,
                    "pearson_r": round(float(r_drift), 4) if r_drift is not None else None,
                    "p_value": round(float(p_drift), 6) if p_drift is not None else None,
                    "group_values": {label: val for label, val in zip(labels, values)},
                }
                result["methodology"] = (
                    f"Identified '{id_col}' as a sequential identifier/index. Segmented into {len(labels)} "
                    f"quantiles to test for sequence drift, temporal trends, or row-order leakage in '{target_col}'."
                )
                result["warnings"].append(
                    f"'{id_col}' is a high-cardinality primary key. Values were grouped into sequence deciles."
                )
                result["visualization"] = {
                    "type": "bar",
                    "data": {
                        "labels": labels,
                        "values": values,
                        "xLabel": f"{id_col} (Sequence Quantiles)",
                        "yLabel": f"{id_aggregation.title()} of {target_col}",
                    },
                }
                return result
            except Exception:
                pass  # Fall through to standard numeric handling

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO 2: BOTH CONTINUOUS NUMERIC -> SCATTER PLOT WITH OLS TRENDLINE
    # ──────────────────────────────────────────────────────────────────────────
    if role_a == "continuous" and role_b == "continuous":
        if requested_aggregation != "auto":
            result["warnings"].append(
                f"Aggregation '{requested_aggregation}' applies to grouped comparisons, so the numeric scatter uses raw paired observations."
            )
        if a.nunique() < 2 or b.nunique() < 2:
            result["statistics"] = {"sample_size": n, "pearson_r": None, "p_value": None}
            result["visualization"] = {"type": "scatter", "data": {"x": a.tolist(), "y": b.tolist(), "xLabel": col_a, "yLabel": col_b}}
            return result

        r, pval = pearsonr(a, b)
        try:
            rho, p_rho = spearmanr(a, b)
        except Exception:
            rho, p_rho = None, None
        slope, intercept = np.polyfit(a.astype(float), b.astype(float), 1)

        result["statistics"] = {
            "pearson_r": round(float(r), 4),
            "p_value": round(float(pval), 6),
            "spearman_rho": round(float(rho), 4) if rho is not None else None,
            "r_squared": round(float(r) ** 2, 4),
            "sample_size": n,
            "slope": round(float(slope), 6),
            "intercept": round(float(intercept), 6),
            "strength": _correlation_strength(float(r)),
        }
        result["methodology"] = (
            f"Pearson and Spearman correlations computed on {n} complete observations, "
            "with an Ordinary Least Squares (OLS) linear trendline."
        )
        result["visualization"] = {
            "type": "scatter",
            "data": {
                "x": a.tolist()[:_SCATTER_POINT_CAP],
                "y": b.tolist()[:_SCATTER_POINT_CAP],
                "xLabel": col_a,
                "yLabel": col_b,
                "trend": {"slope": float(slope), "intercept": float(intercept)},
                "plotted": min(n, _SCATTER_POINT_CAP),
            },
        }
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO 3: CATEGORICAL / DISCRETE / BINARY INVOLVED -> GROUPED BAR CHART
    # ──────────────────────────────────────────────────────────────────────────
    # Dtype wins over low-cardinality role labels here. A numeric measure with
    # only a handful of observations can be labelled "categorical" by the role
    # classifier, but it is still the value to summarize in `region` vs `age`.
    a_is_numeric_measure = (
        pd.api.types.is_numeric_dtype(a) and role_a not in ("identifier", "constant", "empty")
    )
    b_is_numeric_measure = (
        pd.api.types.is_numeric_dtype(b) and role_b not in ("identifier", "constant", "empty")
    )

    if a_is_numeric_measure and not b_is_numeric_measure and role_b not in ("identifier", "constant", "empty"):
        group_col, value_col = col_b, col_a
        group_role, value_role = role_b, role_a
    elif b_is_numeric_measure and not a_is_numeric_measure and role_a not in ("identifier", "constant", "empty"):
        group_col, value_col = col_a, col_b
        group_role, value_role = role_a, role_b
    elif role_a in ("categorical", "binary") and role_b == "continuous":
        group_col, value_col = col_a, col_b
        group_role, value_role = role_a, role_b
    elif role_b in ("categorical", "binary") and role_a == "continuous":
        group_col, value_col = col_b, col_a
        group_role, value_role = role_b, role_a
    elif role_a == "categorical" and role_b == "binary":
        group_col, value_col = col_a, col_b
        group_role, value_role = role_a, role_b
    elif role_b == "categorical" and role_a == "binary":
        group_col, value_col = col_b, col_a
        group_role, value_role = role_b, role_a
    elif a.nunique() <= b.nunique():
        group_col, value_col = col_a, col_b
        group_role, value_role = role_a, role_b
    else:
        group_col, value_col = col_b, col_a
        group_role, value_role = role_b, role_a

    frame = paired[[group_col, value_col]]

    # A marginal count by just one variable erases the other variable entirely.
    # Plot the joint frequencies for two label/boolean columns instead.
    if group_role in ("categorical", "binary", "high_cardinality") and value_role in ("categorical", "binary", "high_cardinality"):
        frequencies = frame.groupby([group_col, value_col], observed=True).size().sort_values(ascending=False)
        shown = frequencies.head(_CATEGORY_CAP)
        chi2, p_chi, cv = _chi_square_test(frame, group_col, value_col)
        result["statistics"] = {
            "sample_size": n, "aggregation_used": "count", "aggregation_requested": requested_aggregation,
            "aggregation_reason": "Joint frequencies preserve both categorical variables.",
            "chi2": chi2, "chi2_p_value": p_chi, "cramers_v": cv,
            "pairs_total": len(frequencies), "omitted_records": int(frequencies.iloc[_CATEGORY_CAP:].sum()),
        }
        if requested_aggregation not in {"auto", "count"}:
            result["warnings"].append("Means and medians do not summarize label pairs; joint counts are shown.")
        result["methodology"] = "Joint category counts with chi-square association on complete paired observations."
        result["visualization"] = {"type": "bar", "data": {
            "xLabel": f"{group_col} × {value_col}", "yLabel": "Records",
            "labels": [f"{a_label} / {b_label}" for a_label, b_label in shown.index],
            "values": shown.tolist(),
            "note": f"Showing {len(shown)} of {len(frequencies)} category pairs; {int(frequencies.iloc[_CATEGORY_CAP:].sum())} records omitted.",
        }}
        return result

    is_val_numeric = pd.api.types.is_numeric_dtype(frame[value_col])
    if is_val_numeric:
        aggregate, aggregation_reason = _resolve_aggregation(
            frame[value_col], requested_aggregation
        )
        grouped_values = frame.groupby(group_col, dropna=False)[value_col]
        grouped = _aggregate_grouped(grouped_values, aggregate)
        counts = grouped_values.size()
        y_label = "Records" if aggregate == "count" else f"{aggregate.title()} of {value_col}"
    else:
        aggregate = "count"
        grouped = frame.groupby(group_col, dropna=False)[value_col].size()
        counts = grouped
        y_label = f"Count of {value_col}"
        aggregation_reason = "count is the meaningful summary for two categorical values"
        if requested_aggregation not in {"auto", "count"}:
            result["warnings"].append(
                f"Aggregation '{requested_aggregation}' is not applicable to two categorical values; counts were used."
            )

    # Descending bars make the strongest groups immediately visible. A time
    # axis has already taken the dedicated line-chart path above.
    grouped = grouped.sort_values(ascending=False)

    grouped = grouped.head(_CATEGORY_CAP)
    labels = [str(i) for i in grouped.index.tolist()]
    values = [_round_or_none(v) for v in grouped.values]
    selected_counts = counts.reindex(grouped.index).fillna(0)

    stats: Dict[str, Any] = {
        "sample_size": int(len(frame)),
        "groups": int(frame[group_col].nunique(dropna=False)),
        "group_col": group_col,
        "value_col": value_col,
        "aggregate": f"{aggregate} of {value_col} by {group_col}",
        "aggregation_requested": requested_aggregation,
        "aggregation_used": aggregate,
        "aggregation_reason": aggregation_reason,
        "group_values": {label: value for label, value in zip(labels, values)},
        "group_counts": {str(k): int(v) for k, v in selected_counts.items()},
    }

    if values and any(v is not None for v in values):
        present = [v for v in values if v is not None]
        stats["highest_group"] = labels[values.index(max(present))]
        stats["lowest_group"] = labels[values.index(min(present))]
        stats["spread"] = _round_or_none(max(present) - min(present))

    if aggregate == "mean" and frame[group_col].nunique() >= 2:
        eta_sq, f_stat, p_value = _one_way_anova(frame, group_col, value_col)
        if eta_sq is not None:
            stats.update({"eta_squared": eta_sq, "f_statistic": f_stat, "p_value": p_value})

    if group_role in ("categorical", "binary") and value_role in ("categorical", "binary"):
        chi2, p_chi, cv = _chi_square_test(frame, group_col, value_col)
        if chi2 is not None:
            stats.update({"chi2": chi2, "chi2_p_value": p_chi, "cramers_v": cv})

    result["statistics"] = stats
    method_parts = [f"Grouped {value_col} by {group_col} ({aggregate})"]
    if "eta_squared" in stats:
        method_parts.append(f"one-way ANOVA (F={stats['f_statistic']}, p={stats['p_value']})")
    if "chi2" in stats:
        method_parts.append(f"Chi-square test (chi²={stats['chi2']}, Cramér's V={stats['cramers_v']})")
    result["methodology"] = " with ".join(method_parts) + "."

    if frame[group_col].nunique(dropna=False) > _CATEGORY_CAP:
        result["warnings"].append(
            f"{group_col} has {frame[group_col].nunique(dropna=False)} categories; showing the {_CATEGORY_CAP} highest displayed groups."
        )

    result["visualization"] = {
        "type": "bar",
        "data": {
            "labels": labels,
            "values": values,
            "xLabel": group_col,
            "yLabel": y_label,
        },
    }
    return result


def _correlation_strength(r: float) -> str:
    magnitude = abs(r)
    direction = "positive" if r > 0 else "negative"
    if magnitude < 0.1:
        return "negligible"
    if magnitude < 0.3:
        return f"weak {direction}"
    if magnitude < 0.5:
        return f"moderate {direction}"
    if magnitude < 0.7:
        return f"strong {direction}"
    return f"very strong {direction}"


def _round_or_none(value, digits: int = 2):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(number) or np.isinf(number):
        return None
    return round(number, digits)


def _one_way_anova(frame: pd.DataFrame, group_col: str, value_col: str):
    """Return (eta_squared, F, p) for value_col across group_col, or Nones."""
    try:
        from scipy.stats import f_oneway
        samples = [
            group[value_col].dropna().to_numpy()
            for _, group in frame.groupby(group_col, dropna=False)
        ]
        samples = [s for s in samples if len(s) > 1]
        if len(samples) < 2:
            return None, None, None
        f_stat, p_value = f_oneway(*samples)
        if np.isnan(f_stat):
            return None, None, None
        grand_mean = np.concatenate(samples).mean()
        ss_between = sum(len(s) * (s.mean() - grand_mean) ** 2 for s in samples)
        ss_total = sum(((s - grand_mean) ** 2).sum() for s in samples)
        eta_sq = round(float(ss_between / ss_total), 4) if ss_total > 0 else None
        return eta_sq, round(float(f_stat), 4), round(float(p_value), 6)
    except Exception:
        return None, None, None


# ── Correlation analysis ───────────────────────────────────────────────────────

def _correlation_frame(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """Every column that can carry a correlation, as float, with its origin kind.

    Booleans and datetimes are included on purpose. A 0/1 flag correlates
    perfectly well, and a date as epoch seconds is exactly how you discover that
    a metric trends with time — neither used to appear here because
    `select_dtypes(include="number")` excludes both.
    """
    kinds: Dict[str, str] = {}
    data: Dict[str, pd.Series] = {}
    for col in df.columns:
        series = df[col]
        kind = logical_type(series)
        if kind in _NON_ANALYTIC or kind in ("categorical", "text"):
            continue
        if kind == "boolean":
            kinds[str(col)] = "boolean"
        elif pd.api.types.is_datetime64_any_dtype(series):
            kinds[str(col)] = "datetime"
        elif pd.api.types.is_bool_dtype(series):
            kinds[str(col)] = "boolean"
        elif pd.api.types.is_numeric_dtype(series):
            kinds[str(col)] = "numeric"
        else:
            continue
        converted = _as_float(series)
        if converted.notna().sum() >= 3 and converted.dropna().nunique() > 1:
            data[str(col)] = converted
        else:
            kinds.pop(str(col), None)
    return pd.DataFrame(data), kinds


def _association_matrix(df: pd.DataFrame, numeric_cols: List[str]) -> Dict[str, Any]:
    """Strength of association between *any* two columns, on a common 0-1 scale.

    Pearson only speaks to numeric pairs, which left categorical columns — often
    the most interesting ones in HR, survey or e-commerce data — out of the
    correlation view entirely. Cramér's V (categorical x categorical) and the
    correlation ratio (categorical x numeric) fill that in using the helpers
    already in this module.
    """
    cat_cols = _categorical_columns(df, max_levels=30)
    columns = (numeric_cols + [c for c in cat_cols if c not in numeric_cols])[:_CATEGORY_CAP]
    if len(columns) < 2:
        return {"columns": [], "values": [], "methods": [], "kinds": {}}

    kinds = {c: ("numeric" if c in numeric_cols else "categorical") for c in columns}
    size = len(columns)
    values: List[List[Optional[float]]] = [[None] * size for _ in range(size)]
    methods: List[List[Optional[str]]] = [[None] * size for _ in range(size)]

    for i, col_i in enumerate(columns):
        values[i][i], methods[i][i] = 1.0, "self"
        for j in range(i + 1, size):
            col_j = columns[j]
            pair = df[[col_i, col_j]].dropna()
            strength: Optional[float] = None
            method: Optional[str] = None
            if len(pair) >= 3:
                if kinds[col_i] == "numeric" and kinds[col_j] == "numeric":
                    r = _as_float(pair[col_i]).corr(_as_float(pair[col_j]))
                    strength, method = (abs(float(r)) if pd.notna(r) else None), "|pearson r|"
                elif kinds[col_i] == "categorical" and kinds[col_j] == "categorical":
                    _, _, cramers = _chi_square_test(pair, col_i, col_j)
                    strength, method = cramers, "Cramer's V"
                else:
                    group = col_i if kinds[col_i] == "categorical" else col_j
                    value = col_j if group == col_i else col_i
                    numeric_pair = pair.assign(**{value: _as_float(pair[value])})
                    eta_sq, _, _ = _one_way_anova(numeric_pair, group, value)
                    strength = float(np.sqrt(eta_sq)) if eta_sq is not None and eta_sq >= 0 else None
                    method = "correlation ratio (eta)"
            rounded = round(strength, 4) if strength is not None else None
            values[i][j] = values[j][i] = rounded
            methods[i][j] = methods[j][i] = method

    return {"columns": columns, "values": values, "methods": methods, "kinds": kinds}


def run_correlation_analysis(df: pd.DataFrame, top_n: int = 10, method: str = "pearson") -> dict:
    """Pearson and Spearman across every correlatable column, plus mixed associations."""
    if method not in {"pearson", "spearman"}:
        raise ValueError("Correlation method must be 'pearson' or 'spearman'.")
    try:
        top_n = max(1, min(100, int(top_n)))
    except (TypeError, ValueError):
        top_n = 10
    work, kinds = _correlation_frame(df)
    num_cols = list(work.columns)
    if len(num_cols) < 2:
        return sanitize_for_json({
            "method": method,
            "top_n": top_n,
            "pairs": [],
            "matrix": {},
            "matrix_columns": [],
            "matrix_values": [],
            "association": _association_matrix(df, num_cols),
            "column_kinds": kinds,
            "warnings": [
                "Correlation needs at least two columns with numeric, boolean or date "
                f"values that vary; this dataset has {len(num_cols)}."
            ],
        })

    pearson = work.corr(method="pearson", min_periods=3)
    spearman = work.corr(method="spearman", min_periods=3)
    selected = spearman if method == "spearman" else pearson

    pairs = []
    for i in range(len(num_cols)):
        for j in range(i + 1, len(num_cols)):
            r = selected.iloc[i, j]
            if pd.isna(r):
                continue
            rho = None if spearman is None else spearman.iloc[i, j]
            rho = float(rho) if rho is not None and pd.notna(rho) else None
            entry = {
                "col_a": num_cols[i],
                "col_b": num_cols[j],
                "correlation": round(float(r), 4),
                "abs_correlation": round(abs(float(r)), 4),
                "spearman_rho": round(rho, 4) if rho is not None else None,
                "pearson_r": _round_or_none(pearson.iloc[i, j], 4),
                "method": method,
                "sample_size": int(work[[num_cols[i], num_cols[j]]].dropna().shape[0]),
                "strength": _correlation_strength(float(r)),
                "kind_a": kinds.get(num_cols[i], "numeric"),
                "kind_b": kinds.get(num_cols[j], "numeric"),
            }
            # Spearman clearly beating Pearson means the relationship is real but
            # curved, which a Pearson-only view reports as "weak" and hides.
            pearson_r = float(pearson.iloc[i, j])
            if rho is not None and abs(rho) - abs(pearson_r) > 0.15:
                entry["note"] = (
                    f"Monotonic but non-linear: Spearman {abs(rho):.2f} vs Pearson "
                    f"{abs(pearson_r):.2f}. A rank or log-based model would fit better."
                )
                entry["nonlinear"] = True
            pairs.append(entry)
    pairs.sort(key=lambda item: item["abs_correlation"], reverse=True)

    # A wide frame would ship a 200x200 grid no one can read. Keep the columns
    # that actually participate in the strongest relationships.
    heatmap_cols = num_cols
    if len(num_cols) > _CATEGORY_CAP:
        ranked: List[str] = []
        for pair in pairs:
            for name in (pair["col_a"], pair["col_b"]):
                if name not in ranked:
                    ranked.append(name)
                if len(ranked) >= _CATEGORY_CAP:
                    break
            if len(ranked) >= _CATEGORY_CAP:
                break
        heatmap_cols = ranked or num_cols[:_CATEGORY_CAP]
    sub = selected.loc[heatmap_cols, heatmap_cols]

    warnings_list: List[str] = []
    date_cols = [c for c, k in kinds.items() if k == "datetime"]
    if date_cols:
        warnings_list.append(
            f"Date column(s) {', '.join(date_cols)} were converted to epoch seconds, so a "
            "correlation against them reads as a trend over time."
        )
    multicollinear = [p for p in pairs if p["abs_correlation"] > 0.95]
    if multicollinear:
        names = ", ".join(f"{p['col_a']}~{p['col_b']}" for p in multicollinear[:3])
        warnings_list.append(
            f"Near-duplicate columns ({names}) are almost perfectly correlated; keep one "
            "of each pair before modelling."
        )

    return sanitize_for_json({
        "numeric_columns": num_cols,
        "method": method,
        "top_n": top_n,
        "column_kinds": kinds,
        "pairs": pairs[:top_n],
        "all_pairs_count": len(pairs),
        "nonlinear_pairs": [p for p in pairs if p.get("nonlinear")][:top_n],
        "strongest_positive": max(pairs, key=lambda x: x["correlation"]) if pairs else None,
        "strongest_negative": min(pairs, key=lambda x: x["correlation"]) if pairs else None,
        "matrix": sub.round(3).to_dict(),
        # Ordered form: the frontend heatmap must not depend on dict key order.
        "matrix_columns": heatmap_cols,
        "matrix_values": [[_round_or_none(v, 3) for v in row] for row in sub.to_numpy()],
        "association": _association_matrix(df, num_cols),
        "warnings": warnings_list,
        "methodology": (
            f"Matrix and pairs ranked by {method}; Pearson and Spearman calculated with at least three paired observations over numeric, boolean "
            "(as 0/1) and datetime (as epoch seconds) columns; identifiers and constant "
            "columns excluded. Mixed-type associations use Cramer's V for two categoricals "
            "and the correlation ratio (eta) for categorical-versus-numeric."
        ),
    })


# ── Model-ready feature matrix ─────────────────────────────────────────────────

_ONE_HOT_MAX_LEVELS = 12
_ORDINAL_MAX_LEVELS = 50


def _build_design_matrix(df: pd.DataFrame, target: Optional[str]) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """Encode every usable column into a numeric feature matrix.

    Previously the feature-importance path took `select_dtypes(include="number")`
    and silently dropped every categorical and date column, so in a dataset whose
    strongest driver was `region` or `signup_date` the answer was drawn only from
    whatever numbers happened to be left.

    Returns `(X, encoding_notes, skipped)`.
    """
    frames: List[pd.DataFrame] = []
    notes: List[str] = []
    skipped: List[str] = []

    for col in df.columns:
        if target is not None and str(col) == str(target):
            continue
        series = df[col]
        name = str(col)
        kind = logical_type(series)

        if kind in _NON_ANALYTIC:
            skipped.append(f"{name} ({kind})")
            continue

        if pd.api.types.is_bool_dtype(series):
            frames.append(series.astype("float64").rename(name).to_frame())
            notes.append(f"{name}: boolean as 0/1")
            continue

        if pd.api.types.is_datetime64_any_dtype(series):
            # Calendar parts are what let a model express seasonality; the epoch
            # column alone can only express a straight-line trend.
            expanded = pd.DataFrame({
                f"{name}__epoch": _as_float(series),
                f"{name}__year": series.dt.year.astype("float64"),
                f"{name}__month": series.dt.month.astype("float64"),
                f"{name}__dayofweek": series.dt.dayofweek.astype("float64"),
            }, index=df.index)
            frames.append(expanded)
            notes.append(f"{name}: date expanded to epoch + year, month, weekday")
            continue

        if pd.api.types.is_numeric_dtype(series):
            frames.append(_as_float(series).rename(name).to_frame())
            continue

        if kind == "text":
            skipped.append(f"{name} (free text)")
            continue

        levels = int(series.dropna().nunique())
        if levels <= _ONE_HOT_MAX_LEVELS:
            dummies = pd.get_dummies(series.astype("object"), prefix=name, dtype="float64")
            if len(dummies.columns):
                frames.append(dummies)
                notes.append(f"{name}: one-hot encoded into {len(dummies.columns)} columns")
            continue
        if levels <= _ORDINAL_MAX_LEVELS:
            # Rank by frequency so the integer codes carry at least prevalence
            # order rather than arbitrary alphabetical order.
            order = series.value_counts().index
            mapping = {value: rank for rank, value in enumerate(order)}
            frames.append(series.map(mapping).astype("float64").rename(name).to_frame())
            notes.append(f"{name}: {levels} levels ordinal-encoded by frequency rank")
            continue
        skipped.append(f"{name} ({levels} levels — too many to encode)")

    if not frames:
        return pd.DataFrame(index=df.index), notes, skipped

    X = pd.concat(frames, axis=1)
    X = X.replace([np.inf, -np.inf], np.nan)
    X = X.dropna(axis=1, how="all")
    X = X.loc[:, X.nunique(dropna=True) > 1]
    if len(X.columns):
        X = X.fillna(X.median(numeric_only=True)).fillna(0.0)
    return X, notes, skipped


def _prepare_target(series: pd.Series) -> Tuple[Optional[pd.Series], str, Optional[List[str]], Optional[str]]:
    """Turn a target column into `(y, task, class_labels, error)`.

    Choosing the task from the data is what makes a `Yes`/`No` or `survived`
    column usable at all: it used to be rejected outright, and a 2-class numeric
    label was fitted with a *regressor*, which reports R-squared on a coin flip.
    """
    valid = series.dropna()
    if len(valid) < 5:
        return None, "", None, f"Target '{series.name}' has only {len(valid)} non-missing values."
    kind = logical_type(series)
    if kind in ("identifier", "constant", "empty"):
        return None, "", None, (
            f"'{series.name}' is a {kind} column, so it cannot be predicted."
        )

    if pd.api.types.is_bool_dtype(series):
        return valid.astype("float64").astype("int64"), "classification", ["False", "True"], None

    if pd.api.types.is_datetime64_any_dtype(series):
        return _as_float(valid), "regression", None, None

    if pd.api.types.is_numeric_dtype(series):
        n_unique = int(valid.nunique())
        # Small integer label sets are classes (survived, rating, star count);
        # anything continuous is a regression target.
        if n_unique == 2 or (pd.api.types.is_integer_dtype(valid) and n_unique <= 10):
            codes, labels = pd.factorize(valid, sort=True)
            return pd.Series(codes, index=valid.index), "classification", [str(v) for v in labels], None
        return _as_float(valid), "regression", None, None

    if kind == "text":
        return None, "", None, (
            f"'{series.name}' is free text with {valid.nunique()} distinct values — "
            "not a usable prediction target."
        )
    n_unique = int(valid.nunique())
    if n_unique > 50:
        return None, "", None, (
            f"'{series.name}' has {n_unique} distinct categories, too many to model as classes."
        )
    codes, labels = pd.factorize(valid, sort=True)
    return pd.Series(codes, index=valid.index), "classification", [str(v) for v in labels], None


def _cross_validated_score(model, X: pd.DataFrame, y: pd.Series, task: str) -> Optional[float]:
    """Out-of-sample score. In-sample R-squared on a random forest is near 1 by
    construction, so the in-sample number alone always overstates the model."""
    try:
        from sklearn.model_selection import cross_val_score
    except ImportError:
        return None
    folds = 5 if len(X) >= 50 else (3 if len(X) >= 15 else 0)
    if folds == 0:
        return None
    if task == "classification":
        smallest_class = int(y.value_counts().min())
        folds = min(folds, smallest_class)
        if folds < 2:
            return None
    try:
        scoring = "accuracy" if task == "classification" else "r2"
        scores = cross_val_score(model, X, y, cv=folds, scoring=scoring)
        return round(float(np.mean(scores)), 4)
    except Exception:
        return None


# ── Multivariate analysis ──────────────────────────────────────────────────────

def _choose_clusters(components: np.ndarray, requested) -> Tuple[int, str]:
    """Estimate k on a reproducible bounded sample; never exceed distinct points."""
    from sklearn.metrics import silhouette_score

    unique = len(np.unique(components.round(10), axis=0))
    if unique < 2:
        return 0, "Fewer than two distinct projected records."
    if requested != "auto":
        used = min(int(requested), unique, len(components))
        return used, f"Requested {requested} groups; using {used} for {unique} distinct projected records."
    indices = np.random.default_rng(42).choice(len(components), min(len(components), 600), replace=False)
    sample = components[indices]
    max_k = min(8, len(np.unique(sample.round(10), axis=0)), len(sample) - 1)
    scored = []
    for k in range(2, max_k + 1):
        labels = KMeans(n_clusters=k, random_state=42, n_init=5).fit_predict(sample)
        if 1 < len(np.unique(labels)) < len(sample):
            scored.append((float(silhouette_score(sample, labels)), k))
    if not scored:
        return 2, "Two distinct groups available; too few observations for silhouette selection."
    score, k = max(scored, key=lambda item: (item[0], -item[1]))
    return k, f"Auto selected {k} groups by silhouette score ({score:.3f}) on {len(sample)} sampled records; exploratory, not proof of natural classes."


def run_multivariate_analysis(df: pd.DataFrame, target: Optional[str] = None, n_clusters="auto") -> dict:
    if n_clusters != "auto":
        if isinstance(n_clusters, bool) or not str(n_clusters).isdigit() or not 2 <= int(n_clusters) <= 8:
            raise ValueError("Cluster count must be 'auto' or an integer from 2 to 8.")
        n_clusters = int(n_clusters)
    result: Dict[str, Any] = {}
    warnings_list: List[str] = []

    # Top influencers — classifier or regressor, chosen from the target's type.
    result["top_influencers"] = []
    if target and target in df.columns and _has_sklearn:
        y, task, class_labels, error = _prepare_target(df[target])
        if error:
            warnings_list.append(error)
        else:
            X, notes, skipped = _build_design_matrix(df, target)
            X, y = X.align(y, join="inner", axis=0)
            if len(X.columns) == 0:
                warnings_list.append("No usable feature columns for the influencer model.")
            elif len(X) < 5:
                warnings_list.append(f"Only {len(X)} complete rows — too few to fit a model.")
            else:
                model = (
                    RandomForestClassifier(n_estimators=100, random_state=42)
                    if task == "classification" else
                    RandomForestRegressor(n_estimators=100, random_state=42)
                )
                model.fit(X, y)
                importances = pd.Series(model.feature_importances_, index=X.columns) \
                    .sort_values(ascending=False)
                result["top_influencers"] = [
                    {"feature": str(k), "importance": round(float(v), 4)}
                    for k, v in importances.head(10).items()
                ]
                result["model"] = type(model).__name__
                result["task"] = task
                result["target"] = target
                if class_labels:
                    result["classes"] = class_labels
                result["encoding"] = notes
                if skipped:
                    result["features_skipped"] = skipped
    elif target and target not in df.columns:
        warnings_list.append(f"Target column '{target}' is not in this dataset.")
    elif not _has_sklearn:
        warnings_list.append("scikit-learn is not installed, so modelling was skipped.")

    # Natural groups via PCA + KMeans
    if _has_sklearn:
        # Use all supported predictor types consistently and exclude the target.
        X, cluster_encoding, cluster_skipped = _build_design_matrix(df, target=target)
        if len(X) >= 2 and X.shape[1] >= 2 and len(X.drop_duplicates()) >= 2:
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            pca = PCA(n_components=2, random_state=42)
            components = pca.fit_transform(X_scaled)
            clusters, cluster_reason = _choose_clusters(components, n_clusters)
            if clusters < 2:
                result.setdefault("warnings", []).append(cluster_reason)
                return result
            km = KMeans(n_clusters=clusters, random_state=42, n_init=10)
            labels = km.fit_predict(components)
            variance = [round(float(v), 4) for v in pca.explained_variance_ratio_]
            loadings = pd.DataFrame(pca.components_.T, columns=["pc1", "pc2"], index=X.columns)
            # Real-world feature averages per cluster for understandable comparison
            profiles = []
            features_to_summarize = list(X.columns)
            for c_id in sorted(np.unique(labels)):
                sub = X.loc[labels == c_id]
                means = {}
                medians = {}
                for f in features_to_summarize:
                    m_val = float(sub[f].mean()) if len(sub) else 0.0
                    means[str(f)] = round(m_val, 2)
                    medians[str(f)] = round(float(sub[f].median()), 2)
                profiles.append({
                    "cluster_id": int(c_id),
                    "name": f"Group {c_id}",
                    "count": int(len(sub)),
                    "pct": round(len(sub) / max(len(X), 1) * 100, 1),
                    "feature_means": means,
                    "feature_medians": medians,
                })

            result["pca_clusters"] = {
                "n_components": 2,
                "explained_variance": variance,
                "explained_variance_total": round(sum(variance), 4),
                "points": components[np.linspace(0, len(X) - 1, min(500, len(X)), dtype=int)].tolist(),
                "cluster_labels": labels[np.linspace(0, len(X) - 1, min(500, len(X)), dtype=int)].tolist(),
                "cluster_sizes": {str(k): int(v) for k, v in pd.Series(labels).value_counts().items()},
                "n_clusters": int(len(np.unique(labels))),
                "clusters_requested": n_clusters,
                "selection_reason": cluster_reason,
                "encoding": cluster_encoding,
                "features_skipped": cluster_skipped,
                "features_used": list(X.columns),
                "cluster_profiles": profiles,
                "comparison_features": features_to_summarize,
                # Which original columns define each axis — without this the two
                # PCA axes are unnamed and the scatter cannot be interpreted.
                "pc1_drivers": [
                    {"feature": str(k), "loading": round(float(v), 4)}
                    for k, v in loadings["pc1"].abs().sort_values(ascending=False).head(5).items()
                ],
                "pc2_drivers": [
                    {"feature": str(k), "loading": round(float(v), 4)}
                    for k, v in loadings["pc2"].abs().sort_values(ascending=False).head(5).items()
                ],
            }
        else:
            warnings_list.append(
                f"Clustering needs at least 2 varying encoded features and 2 distinct records; "
                f"{X.shape[1]} features and {len(X)} rows are available."
            )
    else:
        warnings_list.append("scikit-learn is not installed, so clustering was skipped.")

    if warnings_list:
        result["warnings"] = warnings_list
    if not result.get("top_influencers") and "pca_clusters" not in result:
        result.setdefault("error", "No numeric or encodable columns for multivariate analysis")

    model_name = result.get("model", "RandomForest")
    result["methodology"] = (
        f"{model_name} impurity importance over encoded features (categoricals one-hot or "
        "frequency-ranked, dates expanded to epoch and calendar parts), plus PCA "
        "(2 components) on standardised numeric columns followed by K-Means clustering."
    )
    return result


# ── Feature discovery / importance ─────────────────────────────────────────────

#: Ordered by how strongly the name implies "this is the thing to predict".
_TARGET_HINTS = (
    "target", "label", "class", "outcome", "result", "response", "y",
    "churn", "churned", "survived", "default", "fraud", "converted", "clicked",
    "price", "revenue", "sales", "income", "salary", "cost", "amount",
    "score", "rating", "demand", "count", "total",
)


def detect_target_variable(df: pd.DataFrame) -> Optional[str]:
    """Pick the most plausible prediction target.

    The name hints are matched as whole tokens. Matching them as substrings meant
    the hint `"y"` fired on `city`, `quantity`, `day`, `year` and `payment`, so
    Feature Discovery routinely explained a column nobody asked about.
    """
    candidates: List[str] = []
    for col in df.columns:
        series = df[col]
        kind = logical_type(series)
        if kind in _NON_ANALYTIC or kind == "text":
            continue
        if pd.api.types.is_datetime64_any_dtype(series):
            continue
        n_unique = int(series.dropna().nunique())
        if n_unique < 2 or (kind == "categorical" and n_unique > 50):
            continue
        candidates.append(str(col))
    if not candidates:
        return None

    token_map = {
        col: [t for t in re.split(r"[^a-z0-9]+", col.lower()) if t]
        for col in candidates
    }
    for hint in _TARGET_HINTS:
        for col in candidates:
            if hint in token_map[col]:
                return col
    # No name hint: prefer a genuine label-shaped column (few classes) over an
    # arbitrary measurement, then fall back to the widest-ranging numeric.
    binary = [c for c in candidates if df[c].dropna().nunique() == 2]
    if binary:
        return binary[0]
    numeric = [c for c in candidates if pd.api.types.is_numeric_dtype(df[c])]
    if numeric:
        scored = [(c, int(df[c].nunique())) for c in numeric]
        scored = [item for item in scored if 2 < item[1] < max(len(df) * 0.8, 3)] or scored
        scored.sort(key=lambda item: item[1])
        return scored[-1][0]
    return candidates[0]


def build_analysis_capabilities(df: pd.DataFrame) -> dict:
    """Describe what the current dataset can support before a tool is run.

    The UI used to expose the same controls for every file and only discover a
    limitation after the request failed. This manifest is deliberately derived
    from the normalized frame, so a date-only, survey, identifier-heavy, or
    sparse dataset can be explained and guided without hard-coded assumptions.
    """
    roles = {str(col): logical_type(df[col]) for col in df.columns}
    varying = [
        name for name, kind in roles.items()
        if kind not in _NON_ANALYTIC
    ]
    numeric = _numeric_columns(df)
    dates = _datetime_columns(df)
    categorical = _categorical_columns(df)
    boolean = [name for name, kind in roles.items() if kind == "boolean"]
    text = [name for name, kind in roles.items() if kind == "text"]
    identifiers = [name for name, kind in roles.items() if kind == "identifier"]
    constants = [name for name, kind in roles.items() if kind == "constant"]
    correlation_frame, correlation_kinds = _correlation_frame(df)
    association_columns = set(correlation_frame.columns) | set(categorical)
    target = detect_target_variable(df)
    model_inputs = [
        name for name, kind in roles.items()
        if name != target and kind not in {"identifier", "constant", "empty", "text"}
    ]
    encoded, _, _ = _build_design_matrix(df, target)

    warnings: List[str] = []
    if len(df) == 0:
        warnings.append("This file has headers but no data rows.")
    if not varying and len(df.columns):
        warnings.append("All columns are empty, constant, or identifier-like.")
    if text:
        warnings.append(
            f"{len(text)} free-text column(s) are profiled by length and tokens; "
            "they are not used as raw numeric features."
        )
    if identifiers:
        warnings.append(
            f"{len(identifiers)} identifier column(s) are excluded from statistical "
            "relationships to avoid misleading results."
        )
    if len(df) and float(df.isna().mean().mean()) >= 0.5:
        warnings.append("At least half of the dataset cells are missing; review the cleaning plan before modelling.")

    capabilities = {
        "univariate": bool(len(df.columns)),
        "bivariate": len(varying) >= 2,
        "correlation": len(association_columns) >= 2,
        "multivariate": bool(len(df) >= 2 and encoded.shape[1] >= 1),
        "feature_discovery": bool(target and model_inputs and len(df) >= 5),
        "cleaning": bool(len(df.columns)),
    }
    recommendations = {
        "target": target,
        "numeric": numeric[:5],
        "categorical": categorical[:5],
        "datetime": dates[:3],
        "boolean": boolean[:3],
        "model_inputs": model_inputs[:10],
    }
    return sanitize_for_json({
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "column_roles": roles,
        "column_kinds_for_correlation": correlation_kinds,
        "counts": {
            "numeric": len(numeric),
            "categorical": len(categorical),
            "datetime": len(dates),
            "boolean": len(boolean),
            "text": len(text),
            "identifiers": len(identifiers),
            "constants": len(constants),
        },
        "supported": capabilities,
        "recommendations": recommendations,
        "warnings": warnings,
    })


def run_feature_importance(df: pd.DataFrame, target: str) -> dict:
    """Random-forest importance over *all* encodable columns, not just numbers."""
    if not _has_sklearn:
        return {"error": "scikit-learn not installed"}
    if target not in df.columns:
        return {"error": f"Target column '{target}' not found"}

    y, task, class_labels, error = _prepare_target(df[target])
    if error:
        return {"error": error, "target": target}

    X, notes, skipped = _build_design_matrix(df, target)
    X, y = X.align(y, join="inner", axis=0)

    if len(X.columns) == 0:
        return {"error": "No usable feature columns available", "target": target,
                "features_skipped": skipped}
    if len(X) < 5:
        return {"error": f"Only {len(X)} complete rows — too few to fit a model.", "target": target}

    if task == "classification":
        model = RandomForestClassifier(n_estimators=100, random_state=42)
    else:
        model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X, y)

    importances = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
    ranked = [
        {"rank": i, "feature": str(k), "importance": round(float(v), 4), "pct": round(float(v) * 100, 2)}
        for i, (k, v) in enumerate(importances.items(), 1)
    ]
    cumulative = np.cumsum([item["importance"] for item in ranked])
    drivers = int(np.searchsorted(cumulative, 0.8) + 1) if len(cumulative) else 0

    in_sample = round(float(model.score(X, y)), 4)
    cv_score = _cross_validated_score(
        RandomForestClassifier(n_estimators=100, random_state=42) if task == "classification"
        else RandomForestRegressor(n_estimators=100, random_state=42),
        X, y, task,
    )

    payload: Dict[str, Any] = {
        "target": target,
        "task": task,
        "model": type(model).__name__,
        "n_estimators": 100,
        "sample_size": int(len(X)),
        "n_features": int(len(X.columns)),
        "feature_importance": ranked,
        "top_features": [item["feature"] for item in ranked[:5]],
        "drivers_for_80pct": drivers,
        "encoding": notes,
        "features_skipped": skipped,
        "methodology": (
            f"{type(model).__name__} (100 trees, seed 42) fitted on every usable column — "
            "numeric as-is, booleans as 0/1, dates expanded to epoch and calendar parts, "
            "categoricals one-hot encoded up to "
            f"{_ONE_HOT_MAX_LEVELS} levels and frequency-ranked up to {_ORDINAL_MAX_LEVELS}. "
            "Importances are mean impurity decrease, normalised to sum to 1."
        ),
        "limitations": [
            "Impurity importance is biased toward high-cardinality features.",
            "In-sample scores overstate predictive power; read the cross-validated score.",
            "One-hot encoding splits a category's importance across its levels.",
        ],
    }

    if task == "classification":
        payload["classes"] = class_labels
        payload["class_balance"] = {
            (class_labels[int(k)] if class_labels and int(k) < len(class_labels) else str(k)): int(v)
            for k, v in y.value_counts().items()
        }
        payload["accuracy"] = in_sample
        payload["cv_accuracy"] = cv_score
        majority = float(y.value_counts(normalize=True).max())
        payload["baseline_accuracy"] = round(majority, 4)
        if cv_score is not None and cv_score <= majority + 0.02:
            payload["limitations"].append(
                f"Cross-validated accuracy ({cv_score:.0%}) is no better than always "
                f"predicting the majority class ({majority:.0%}); these features carry "
                "little signal for this target."
            )
    else:
        payload["r_squared"] = in_sample
        payload["cv_r_squared"] = cv_score
        if cv_score is not None and cv_score < 0:
            payload["limitations"].append(
                "Cross-validated R-squared is negative: the model predicts worse than the "
                "target's own mean, so treat the ranking as unreliable."
            )
    if skipped:
        payload["limitations"].append(
            f"Excluded from the model: {', '.join(skipped[:5])}"
            + ("…" if len(skipped) > 5 else "")
        )
    return payload


# ── Outliers / anomalies ───────────────────────────────────────────────────────

def run_outlier_analysis(df: pd.DataFrame, columns: Optional[List[str]] = None) -> dict:
    """IQR outlier scan plus the impossible-value checks the Streamlit build ran."""
    num_cols = columns or _numeric_columns(df)
    total = max(len(df), 1)
    per_column = []
    anomalies: List[str] = []

    for col in num_cols:
        if col not in df.columns:
            continue
        series = _as_float(df[col]).dropna()
        if series.empty:
            continue
        q1, q3 = float(series.quantile(0.25)), float(series.quantile(0.75))
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        mask = (series < lower) | (series > upper) if iqr > 0 else pd.Series(False, index=series.index)
        count = int(mask.sum())
        extreme = series[mask].abs().sort_values(ascending=False).head(5).tolist() if count else []
        per_column.append({
            "column": str(col),
            "count": count,
            "pct": round(count / total * 100, 2),
            "lower_bound": _round_or_none(lower),
            "upper_bound": _round_or_none(upper),
            "extreme_values": [_round_or_none(v) for v in extreme],
        })

        negatives = int((series < 0).sum())
        zeros = int((series == 0).sum())
        name = str(col).lower()
        if negatives and any(word in name for word in ("price", "amount", "cost", "age", "quantity", "count", "salary", "income")):
            anomalies.append(f"'{col}' contains {negatives} negative values, which is implausible for this measure.")
        if zeros / max(len(series), 1) > 0.5:
            anomalies.append(f"'{col}' is {zeros / len(series) * 100:.0f}% zeros — check whether zero encodes 'missing'.")

    per_column.sort(key=lambda item: item["pct"], reverse=True)
    flagged = [item for item in per_column if item["count"] > 0]
    return {
        "columns_scanned": len(per_column),
        "columns_with_outliers": len(flagged),
        "total_outliers": sum(item["count"] for item in per_column),
        "per_column": per_column,
        "worst_column": flagged[0]["column"] if flagged else None,
        "anomalies": anomalies,
        "methodology": (
            "Tukey IQR fence: values below Q1-1.5xIQR or above Q3+1.5xIQR. Identifier and "
            "constant columns are excluded, since a key has no distribution to be an outlier in."
        ),
    }


# ── Key insights ───────────────────────────────────────────────────────────────

def derive_key_insights(df: pd.DataFrame, health: dict, correlation: dict, outliers: dict) -> List[str]:
    """Plain-English facts, each one read straight off a computed number."""
    insights: List[str] = []
    rows, cols = df.shape
    insights.append(f"The dataset holds {rows:,} rows across {cols} columns.")

    score = health.get("health_score")
    if score is not None:
        verdict = "good" if score >= 80 else "fair" if score >= 60 else "poor"
        insights.append(f"Overall data health scores {score}/100 ({verdict}).")

    missing_pct = health.get("breakdown", {}).get("missing_values_pct", 0)
    if missing_pct:
        worst = df.isnull().mean().sort_values(ascending=False)
        if len(worst) and worst.iloc[0] > 0:
            insights.append(
                f"{missing_pct}% of all cells are missing; '{worst.index[0]}' is the worst affected "
                f"at {worst.iloc[0] * 100:.1f}%."
            )

    duplicates = health.get("breakdown", {}).get("duplicates_count", 0)
    if duplicates:
        insights.append(f"{duplicates:,} fully duplicated rows were found ({duplicates / max(rows, 1) * 100:.1f}%).")

    pairs = correlation.get("pairs") or []
    if pairs:
        top = pairs[0]
        insights.append(
            f"The strongest linear relationship is {top['col_a']} vs {top['col_b']} "
            f"(r = {top['correlation']})."
        )

    if outliers.get("worst_column"):
        worst = next(item for item in outliers["per_column"] if item["column"] == outliers["worst_column"])
        insights.append(f"'{worst['column']}' carries the most outliers: {worst['count']:,} values ({worst['pct']}%).")

    insights.extend(outliers.get("anomalies", [])[:3])
    return insights



def sanitize_for_json(obj):
    """Make an arbitrary pandas/numpy structure safe for ``json.dumps``.

    FastAPI serialises with the stdlib encoder, which rejects numpy scalars,
    ``NaN``/``Infinity``, timestamps, and any non-string dict key. Anything that
    reaches a response body passes through here, so every branch below is a
    crash that would otherwise surface as a 500 with no useful message.
    """
    import math

    if obj is None or isinstance(obj, (str, bool, int)):
        return obj
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj

    # NaT and pandas' NA singleton are not caught by the isinstance chain below.
    try:
        if obj is pd.NaT or obj is getattr(pd, "NA", object()):
            return None
    except Exception:
        pass

    if isinstance(obj, dict):
        # JSON object keys must be strings; grouped frames routinely produce
        # numeric or Timestamp keys.
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [sanitize_for_json(v) for v in obj]

    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        f = float(obj)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(obj, np.ndarray):
        return [sanitize_for_json(v) for v in obj.tolist()]
    if isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()
    if isinstance(obj, pd.Timedelta):
        return str(obj)
    if isinstance(obj, pd.Series):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, pd.DataFrame):
        return sanitize_for_json(obj.to_dict(orient="records"))
    if isinstance(obj, np.generic):
        return sanitize_for_json(obj.item())

    try:
        if pd.isna(obj):
            return None
    except (TypeError, ValueError):
        pass
    return obj


# ── EDA summary ─────────────────────────────────────────────────────────────────

def run_eda(df: pd.DataFrame, dataset_name: Optional[str] = None) -> dict:
    preview = df.head(5).to_dict(orient="records")
    return {
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "missing_total": int(df.isnull().sum().sum()),
        "column_names": list(df.columns),
        "dtypes": {c: str(t) for c, t in df.dtypes.items()},
        "preview": sanitize_for_json(preview),
    }
