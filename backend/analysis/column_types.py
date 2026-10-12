"""
Column type inference and value coercion — the single place that decides what a
column *is*.

A CSV from the wild arrives with dates as text, money as ``"$1,234.56"``,
percentages as ``"45%"``, booleans as ``"Yes"``/``"No"``, and missing values
written a dozen different ways. ``pd.read_csv`` leaves all of it as ``object``.
Every analysis tool in this package selects its columns by dtype
(``select_dtypes(include="number")``, ``include="datetime"``), so an un-coerced
frame means dates are never plotted against a time axis, money never gets a
mean, and booleans land in neither the numeric nor the categorical column list.

This module runs once, at load time (``adapters.load_dataset``). Fixing the
dtypes at the door is what makes correlation, outlier scanning, feature
importance and the profile start working on those columns — none of those call
sites change.

Design rules, in priority order:

1. **All-or-nothing per column.** A column converts only when at least
   ``_COERCE_MIN_RATE`` of its non-null values parse. Below that the original
   values are kept untouched; a half-parsed column is worse than a text one.
2. **Nothing changes silently.** Every conversion carries a ``reason`` string
   that the UI shows and the LLM prompt can quote.
3. **Refuse when a guess would destroy data.** A ``year`` column of ``2019``
   must not become 1970-01-01; a zero-padded ``00123`` account number must not
   become ``123``. The guards in ``_should_try_*`` exist for specific
   corruptions observed in real files, so read them before relaxing one.
4. **Idempotent.** Running this on an already-normalised frame is a no-op, so
   the cleaning path can reuse it freely.

Numpy-native dtypes are produced deliberately (``int64``/``float64``/
``datetime64[ns]``) because the downstream code calls ``np.histogram``,
``Series.quantile`` and scikit-learn directly. The one exception is coerced
booleans, which use pandas' nullable ``boolean`` dtype so a missing value stays
missing instead of silently becoming ``False``.
"""
from __future__ import annotations

import re
import warnings
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


# ── Vocabulary ─────────────────────────────────────────────────────────────────

#: Strings that mean "no value". A superset of the junk list that
#: ``cleaning_adapter.clean_dataset`` used on its own, matched case-insensitively
#: after stripping. Excel error literals are here because exported sheets are
#: full of them and they otherwise count as legitimate categories.
NULL_TOKENS: frozenset = frozenset({
    "", "-", "--", "---", "?", "??", ".", "n/a", "n.a.", "na", "#n/a", "n/a.",
    "null", "none", "nil", "nan", "<na>", "nat", "undefined", "unknown",
    "missing", "not available", "not applicable", "no data", "blank", "empty",
    "#value!", "#div/0!", "#ref!", "#name?", "#null!", "#num!",
})

_TRUE_TOKENS = frozenset({"true", "t", "yes", "y", "1", "on", "enabled", "active"})
_FALSE_TOKENS = frozenset({"false", "f", "no", "n", "0", "off", "disabled", "inactive"})

#: Name tokens that mark a column as a key rather than a measurement.
_ID_NAME_TOKENS = frozenset({
    "id", "ids", "uuid", "guid", "key", "index", "idx", "code", "ref",
    "sku", "isbn", "ssn", "serial", "barcode", "hash", "token", "slug",
    "no", "num", "number", "account", "acct",
})

#: Name tokens that license the ``YYYYMMDD``-as-integer reading (see
#: ``_should_try_datetime``). Without a name hint an 8-digit integer is far more
#: likely to be an identifier.
_DATE_NAME_TOKENS = frozenset({
    "date", "dates", "day", "dt", "time", "times", "timestamp", "ts",
    "datetime", "month", "year", "created", "updated", "modified", "birth",
    "dob", "start", "end", "period", "expiry", "expires", "joined", "signup",
})

_CURRENCY_RE = re.compile(r"[$€£¥₹₽₩₪₫฿¢]|(?<![A-Za-z])(?:usd|eur|gbp|inr|jpy|cad|aud)(?![A-Za-z])",
                          re.IGNORECASE)
_US_THOUSANDS_RE = re.compile(r"^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$")
_EU_THOUSANDS_RE = re.compile(r"^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$")
_EU_DECIMAL_RE = re.compile(r"^[+-]?\d+,\d+$")
_LEADING_ZERO_RE = re.compile(r"^[+-]?0\d")
_DMY_RE = re.compile(r"^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})")
_BARE_INT_RE = re.compile(r"^[+-]?\d+$")
_YYYYMMDD_RE = re.compile(r"^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$")

#: Tried in order; the first format that clears the parse-rate bar wins. Explicit
#: formats come first because ``format="mixed"`` infers per element, which is both
#: slow and willing to read "1" as a date.
_DATE_FORMATS_MDY = (
    "%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M",
    "%Y/%m/%d", "%m/%d/%Y", "%m/%d/%Y %H:%M", "%m/%d/%Y %H:%M:%S",
    "%m/%d/%y", "%m-%d-%Y", "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%d %b %Y",
    "%d %B %Y", "%Y-%m", "%Y",
)
_DATE_FORMATS_DMY = (
    "%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M",
    "%d/%m/%Y", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%y",
    "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%Y-%m",
)

LOGICAL_TYPES = (
    "numeric", "integer", "boolean", "datetime", "categorical",
    "text", "identifier", "constant", "empty",
)

_COERCE_MIN_RATE = 0.90
_ID_UNIQUE_RATIO = 0.95
_ID_NAME_UNIQUE_RATIO = 0.80
_ID_MIN_ROWS = 3
_CATEGORICAL_MAX_LEVELS = 15
_CATEGORICAL_MAX_RATIO = 0.50
_TEXT_MEAN_CHARS = 40
_TEXT_MEAN_WORDS = 5
_DATE_SAMPLE = 500


# ── Result type ────────────────────────────────────────────────────────────────

@dataclass
class ColumnType:
    """What one column turned out to be, and why.

    ``reason`` is user-facing: it is rendered next to the column in the Dataset
    page and included in the profile the LLM is given, so a conversion is always
    auditable rather than a surprise.
    """

    column: str
    logical: str                          # one of LOGICAL_TYPES
    dtype: str                            # resulting pandas dtype
    reason: str
    unit: Optional[str] = None            # 'currency' | 'percent' | None
    converted_from: Optional[str] = None  # 'text' when a coercion fired
    confidence: float = 1.0               # share of non-null values that parsed
    missing: int = 0
    unique: int = 0
    dropped: bool = False                 # column removed from the frame
    tokens_nulled: int = 0                # junk strings turned into NaN

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NormalizeReport:
    """Everything ``normalize_frame`` changed, for the upload response."""

    column_types: List[ColumnType]
    dropped_columns: List[str]
    dropped_rows: int
    converted_columns: List[str]
    tokens_nulled: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "column_types": [ct.to_dict() for ct in self.column_types],
            "dropped_columns": self.dropped_columns,
            "dropped_rows": self.dropped_rows,
            "converted_columns": self.converted_columns,
            "tokens_nulled": self.tokens_nulled,
        }


# ── Small helpers ──────────────────────────────────────────────────────────────

def _name_tokens(name: Any) -> frozenset:
    s = str(name or "")
    # Expand camelCase / PascalCase e.g. "PassengerId" -> "Passenger Id"
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", s)
    tokens = [t for t in re.split(r"[^a-z0-9]+", s.lower()) if t]
    raw_lower = str(name or "").lower()
    if (raw_lower.endswith("id") or raw_lower.startswith("id_")) and "id" not in tokens:
        tokens.append("id")
    return frozenset(tokens)


def _as_text(series: pd.Series) -> pd.Series:
    """Series as stripped ``StringDtype``, with missing values as ``pd.NA``."""
    return series.astype("string").str.strip()


def _rate(mask: pd.Series, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(int(mask.sum()) / denominator)


def _to_numpy_numeric(values: pd.Series) -> pd.Series:
    """Nullable numeric -> plain numpy, integral floats -> int64 where lossless.

    The rest of this package hands columns straight to ``np.histogram`` and
    scikit-learn, both of which choke on ``pd.NA``. Keeping numpy dtypes here
    means none of those call sites need to care.
    """
    out = pd.to_numeric(values, errors="coerce").astype("float64")
    finite = out[np.isfinite(out)]
    if len(finite) and not out.isna().any() and float(np.abs(finite).max()) < 2 ** 53:
        if bool((finite == finite.round()).all()):
            return out.astype("int64")
    return out


def _looks_like_identifier(series: pd.Series, *, text_only: bool = False) -> bool:
    """True when the column behaves like a key rather than a measurement.

    Name-only detection was the original bug here: a *string* UUID column called
    ``user_id`` was labelled an identifier and then pushed through the numeric
    branch, where ``quantile`` raised ``TypeError``. Uniqueness now does the
    deciding and the name only lowers the bar.
    """
    valid = series.dropna()
    total = len(valid)
    if total < _ID_MIN_ROWS:
        return False
    txt = _as_text(series).dropna()
    if len(txt):
        mean_words = float(txt.str.count(r"\s+").mean()) + 1.0
        if mean_words > 2.0:
            return False
    ratio = valid.nunique() / total
    tokens = _name_tokens(series.name)
    if tokens & _ID_NAME_TOKENS and ratio >= _ID_NAME_UNIQUE_RATIO:
        return True
    if text_only or not pd.api.types.is_numeric_dtype(series):
        if ratio >= _ID_UNIQUE_RATIO and total >= 10:
            return True
        if ratio >= _ID_UNIQUE_RATIO and (tokens & _ID_NAME_TOKENS or (len(txt) and not txt.str.match(r"^[\d\s.,$€£¥%+()\-]+$").all() and txt.str.match(r"^[a-zA-Z0-9_\-]+$").all())):
            return True
    if not text_only and pd.api.types.is_integer_dtype(series):
        if valid.nunique() == total and (tokens & _ID_NAME_TOKENS):
            return True
        if valid.is_monotonic_increasing and valid.nunique() == total:
            min_v = int(valid.min())
            max_v = int(valid.max())
            if min_v in (0, 1) and (max_v - min_v + 1 == total):
                if not tokens or (tokens & _ID_NAME_TOKENS) or any(t.startswith("unnamed") or t in ("index", "idx", "row") for t in tokens):
                    return True
    return False


# ── Coercion: boolean ──────────────────────────────────────────────────────────

def coerce_boolean(series: pd.Series) -> Tuple[Optional[pd.Series], float]:
    """Text yes/no/true/false -> nullable ``boolean``.

    Nullable rather than numpy ``bool`` so a blank cell stays missing; casting a
    missing value to ``False`` would quietly move it into the majority class of
    every downstream proportion.
    """
    if pd.api.types.is_bool_dtype(series):
        return series, 1.0
    txt = _as_text(series)
    n_valid = int(txt.notna().sum())
    if n_valid == 0:
        return None, 0.0
    lowered = txt.str.lower()
    distinct = set(lowered.dropna().unique())
    if not distinct:
        return None, 0.0
    if not distinct <= (_TRUE_TOKENS | _FALSE_TOKENS):
        return None, 0.0
    mapped = lowered.map(lambda v: True if v in _TRUE_TOKENS else False, na_action="ignore")
    return mapped.astype("boolean"), 1.0


# ── Coercion: numeric ──────────────────────────────────────────────────────────

def _should_try_numeric(series: pd.Series, txt: pd.Series, n_valid: int) -> Optional[str]:
    """``None`` to proceed, otherwise the reason to refuse."""
    # Zero-padded values are codes, not quantities: account numbers, postcodes,
    # ISBNs, phone extensions. Parsing them drops the padding irreversibly.
    padded = txt.str.match(_LEADING_ZERO_RE, na=False)
    if int(padded.sum()) > 0 and _rate(txt.str.match(_BARE_INT_RE, na=False), n_valid) > 0.5:
        return "kept as text: values are zero-padded codes, not quantities"
    # A unique sequence of prices/measurements in a CSV is still numeric. The
    # generic text-ID heuristic cannot run before numeric parsing: on >=10 rows
    # it classified every near-unique measurement as a key.
    if _name_tokens(series.name) & _ID_NAME_TOKENS and _looks_like_identifier(series, text_only=True):
        return "kept as text: values are near-unique, so this reads as a key"
    return None


def coerce_numeric(series: pd.Series) -> Tuple[Optional[pd.Series], Optional[str], float, str]:
    """Text money/percentages/formatted numbers -> numpy numeric.

    Returns ``(series_or_None, unit, confidence, note)``. Handles ``$1,234.56``,
    ``45%``, ``(3.20)`` accounting negatives, ``1.234,56`` European notation,
    non-breaking spaces, and a leading ``+``.
    """
    if pd.api.types.is_bool_dtype(series):
        return None, None, 0.0, ""
    if pd.api.types.is_numeric_dtype(series):
        return series, None, 1.0, ""

    txt = _as_text(series)
    n_valid = int(txt.notna().sum())
    if n_valid == 0:
        return None, None, 0.0, ""

    refusal = _should_try_numeric(series, txt, n_valid)
    if refusal:
        return None, None, 0.0, refusal

    work = (txt.str.replace(" ", "", regex=False)
               .str.replace(" ", "", regex=False)
               .str.replace("−", "-", regex=False))  # unicode minus

    unit: Optional[str] = None
    if _rate(work.str.endswith("%", na=False), n_valid) >= _COERCE_MIN_RATE:
        unit = "percent"
        work = work.str.rstrip("%").str.strip()
    if _rate(work.str.contains(_CURRENCY_RE, na=False), n_valid) >= 0.50:
        unit = unit or "currency"
    work = work.str.replace(_CURRENCY_RE, "", regex=True).str.strip()

    # Accounting negatives: (3.20) -> -3.20
    paren = work.str.match(r"^\(.*\)$", na=False)
    if int(paren.sum()):
        work = work.where(~paren, "-" + work.str.slice(1, -1).str.strip())

    # Separator convention: decide per column, never per value. "1.234" is one
    # number in the US and another in Germany, and only the column can say which.
    eu_hits = int(work.str.match(_EU_THOUSANDS_RE, na=False).sum()) + \
        int(work.str.match(_EU_DECIMAL_RE, na=False).sum())
    us_hits = int(work.str.match(_US_THOUSANDS_RE, na=False).sum())
    if eu_hits > us_hits and eu_hits > 0:
        work = work.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    else:
        work = work.str.replace(",", "", regex=False)
    work = work.str.replace(" ", "", regex=False).str.lstrip("+")

    parsed = pd.to_numeric(work, errors="coerce")
    confidence = _rate(parsed.notna(), n_valid)
    if confidence < _COERCE_MIN_RATE:
        return None, None, confidence, f"only {confidence:.0%} of values parse as numbers, so it was left as text"

    out = _to_numpy_numeric(parsed)
    if unit == "percent":
        out = (out.astype("float64") / 100.0)
    return out, unit, confidence, ""


# ── Coercion: datetime ─────────────────────────────────────────────────────────

def _should_try_datetime(series: pd.Series, txt: pd.Series, n_valid: int) -> bool:
    """Guard the single most destructive misread available to a date parser.

    ``pd.to_datetime`` will happily turn the integer 2019 into
    ``1970-01-01T00:00:00.000002019`` and the string "3" into the third of the
    current month. So a column only reaches the parser when its values *look*
    like dates: digits, plus a separator or a spelled month, and long enough to
    carry a year.
    """
    if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        return False
    has_digit = txt.str.contains(r"\d", na=False)
    has_sep = txt.str.contains(r"[-/.:]", na=False) | txt.str.contains(r"[A-Za-z]{3}", na=False)
    long_enough = txt.str.len().ge(6).fillna(False)
    if _rate(has_digit & has_sep & long_enough, n_valid) >= _COERCE_MIN_RATE:
        return True
    # YYYYMMDD packed into 8 digits is a real convention, but an 8-digit integer
    # is more often a key — so require the column name to claim it is a date.
    if _name_tokens(series.name) & _DATE_NAME_TOKENS:
        if _rate(txt.str.match(_YYYYMMDD_RE, na=False), n_valid) >= _COERCE_MIN_RATE:
            return True
    return False


def _dayfirst_hint(txt: pd.Series) -> bool:
    """Resolve ``01/03/2024`` from the column's unambiguous neighbours.

    A single value like ``25/03/2024`` settles the convention for the whole
    column; without one, month-first is the safer default for mixed data.
    """
    first_big = second_big = 0
    for value in txt.dropna().head(_DATE_SAMPLE):
        match = _DMY_RE.match(str(value))
        if not match:
            continue
        left, right = int(match.group(1)), int(match.group(2))
        if left > 12 >= right:
            first_big += 1
        elif right > 12 >= left:
            second_big += 1
    return first_big > second_big


def coerce_datetime(series: pd.Series) -> Tuple[Optional[pd.Series], float, str]:
    """Text dates -> ``datetime64[ns]``. Returns ``(series_or_None, rate, fmt)``."""
    if pd.api.types.is_datetime64_any_dtype(series):
        return series, 1.0, "already datetime"
    txt = _as_text(series)
    n_valid = int(txt.notna().sum())
    if n_valid == 0 or not _should_try_datetime(series, txt, n_valid):
        return None, 0.0, ""

    if _rate(txt.str.match(_YYYYMMDD_RE, na=False), n_valid) >= _COERCE_MIN_RATE:
        parsed = pd.to_datetime(txt, format="%Y%m%d", errors="coerce")
        rate = _rate(parsed.notna(), n_valid)
        if rate >= _COERCE_MIN_RATE:
            return parsed, rate, "%Y%m%d"

    dayfirst = _dayfirst_hint(txt)
    formats = _DATE_FORMATS_DMY if dayfirst else _DATE_FORMATS_MDY
    best: Tuple[Optional[pd.Series], float, str] = (None, 0.0, "")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for fmt in formats:
            try:
                parsed = pd.to_datetime(txt, format=fmt, errors="coerce")
            except (ValueError, TypeError):
                continue
            rate = _rate(parsed.notna(), n_valid)
            if rate >= _COERCE_MIN_RATE:
                return parsed, rate, fmt
            if rate > best[1]:
                best = (parsed, rate, fmt)

        # Mixed conventions in one column (an export stitched from two systems).
        try:
            parsed = pd.to_datetime(txt, errors="coerce", format="mixed", dayfirst=dayfirst)
        except (ValueError, TypeError):
            parsed = None
        if parsed is not None:
            rate = _rate(parsed.notna(), n_valid)
            if rate >= _COERCE_MIN_RATE:
                return parsed, rate, "mixed"
            if rate > best[1]:
                best = (parsed, rate, "mixed")

    return None, best[1], best[2]


# ── Inference on an already-typed column (cheap) ───────────────────────────────

def logical_type(series: pd.Series) -> str:
    """Classify a column from its dtype and cardinality alone.

    Deliberately cheap: this runs per column on every univariate call, against a
    frame that ``normalize_frame`` has already coerced, so there is nothing left
    to parse. ``coerce_column`` is the expensive counterpart that runs once.
    """
    valid = series.dropna()
    total = len(valid)
    if total == 0:
        return "empty"
    n_unique = int(valid.nunique())
    if n_unique == 1:
        return "constant"

    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_timedelta64_dtype(series):
        return "numeric"

    if pd.api.types.is_numeric_dtype(series):
        if n_unique == 2 and set(np.unique(valid.to_numpy())) <= {0, 1}:
            return "boolean"
        if _looks_like_identifier(series):
            return "identifier"
        return "integer" if pd.api.types.is_integer_dtype(series) else "numeric"

    if _looks_like_identifier(series, text_only=True):
        return "identifier"

    txt = _as_text(series).dropna()
    if len(txt):
        mean_chars = float(txt.str.len().mean())
        mean_words = float(txt.str.count(r"\s+").mean()) + 1.0
        if mean_chars > _TEXT_MEAN_CHARS or mean_words > _TEXT_MEAN_WORDS:
            return "text"
    if n_unique <= _CATEGORICAL_MAX_LEVELS or (n_unique / total) <= _CATEGORICAL_MAX_RATIO:
        return "categorical"
    return "text"


# ── Inference + coercion on a raw column (runs once, at load) ──────────────────

def coerce_column(series: pd.Series) -> Tuple[pd.Series, ColumnType]:
    """Return the column as its best-supported type, plus what happened and why."""
    name = str(series.name)
    valid = series.dropna()
    missing = int(series.isna().sum())

    def describe(values: pd.Series, logical: str, reason: str, **kwargs: Any) -> Tuple[pd.Series, ColumnType]:
        return values, ColumnType(
            column=name,
            logical=logical,
            dtype=str(values.dtype),
            reason=reason,
            missing=int(values.isna().sum()),
            unique=int(values.dropna().nunique()),
            **kwargs,
        )

    if len(valid) == 0:
        return describe(series, "empty", "every value is missing")
    if int(valid.nunique()) == 1:
        return describe(series, "constant", f"a single repeated value ({valid.iloc[0]!r}) — no information to analyse")

    if pd.api.types.is_bool_dtype(series):
        return describe(series, "boolean", "already boolean")
    if pd.api.types.is_datetime64_any_dtype(series):
        return describe(series, "datetime", "already a datetime column")

    if pd.api.types.is_numeric_dtype(series):
        logical = logical_type(series)
        reasons = {
            "boolean": "numeric 0/1 flag — read as a boolean, kept numeric so it still correlates",
            "identifier": "near-unique numeric key — excluded from statistics",
            "integer": "whole numbers",
            "numeric": "numeric",
        }
        return describe(series, logical, reasons.get(logical, "numeric"))

    # ── object / string from here on ──────────────────────────────────────────
    as_bool, _ = coerce_boolean(series)
    if as_bool is not None:
        labels = sorted(str(v) for v in _as_text(series).dropna().unique())
        return describe(as_bool, "boolean", f"true/false values ({', '.join(labels)}) read as a boolean",
                        converted_from="text", confidence=1.0)

    numeric, unit, num_conf, refusal = coerce_numeric(series)
    if numeric is not None:
        unit_note = {"currency": "currency amounts", "percent": "percentages (stored as a 0-1 fraction)"}
        what = unit_note.get(unit or "", "numbers stored as text")
        return describe(numeric, "integer" if pd.api.types.is_integer_dtype(numeric) else "numeric",
                        f"{what} parsed from text ({num_conf:.0%} of values)",
                        unit=unit, converted_from="text", confidence=round(num_conf, 4))

    dated, dt_conf, fmt = coerce_datetime(series)
    if dated is not None:
        shown = "mixed date formats" if fmt == "mixed" else f"format {fmt}"
        return describe(dated, "datetime", f"dates parsed from text ({shown}, {dt_conf:.0%} of values)",
                        converted_from="text", confidence=round(dt_conf, 4))

    logical = logical_type(series)
    if logical == "identifier":
        reason = "near-unique values — read as a key, excluded from statistics"
    elif logical == "text":
        reason = "free text — analysed by length and token frequency"
    else:
        series = _reconcile_casing(series)
        reason = f"{int(series.dropna().nunique())} distinct labels — analysed as categories"
        if refusal and "kept as text" in refusal:
            reason = refusal
        elif num_conf:
            reason += f"; only {num_conf:.0%} of values parse as numbers, so it was left as text"
        elif dt_conf:
            reason += f"; only {dt_conf:.0%} of values parse as dates, so it was left as text"
    return describe(series, logical, reason)


# ── Frame-level normalisation ──────────────────────────────────────────────────

def _reconcile_casing(series: pd.Series) -> pd.Series:
    """Reconcile casing variations (e.g. 'USA' vs 'usa') to the most frequent casing."""
    valid = series.dropna()
    if len(valid) == 0:
        return series
    counts = valid.value_counts()
    best_repr: Dict[str, Any] = {}
    for val in counts.index:
        low = str(val).lower()
        if low not in best_repr:
            best_repr[low] = val
    if len(best_repr) < valid.nunique():
        return series.map(lambda v: best_repr.get(str(v).lower(), v) if pd.notna(v) else v).astype(object)
    return series.astype(object)


def _clean_text_column(series: pd.Series) -> Tuple[pd.Series, int]:
    """Strip whitespace and turn ``NULL_TOKENS`` into real ``NaN``.

    ``clean_dataset`` used to claim it did this but computed the junk mask from a
    stripped copy and then assigned into the unstripped column, so ``" Male"``
    and ``"Male"`` stayed two separate categories.
    """
    txt = _as_text(series)
    junk = txt.str.lower().isin(NULL_TOKENS).fillna(False)
    nulled = int((junk & series.notna()).sum())
    txt = txt.mask(junk, pd.NA)
    out = txt.astype(object)
    out[txt.isna()] = np.nan
    return out, nulled


def normalize_frame(df: pd.DataFrame) -> Tuple[pd.DataFrame, NormalizeReport]:
    """Clean and correctly type a freshly-read frame. Idempotent."""
    frame = df.copy()
    original_columns = [str(c) for c in frame.columns]
    rows_before = len(frame)

    # Rows that are entirely blank are a CSV artefact, not observations.
    if len(frame.columns) > 1:
        frame = frame.dropna(axis=0, how="all")

    tokens_nulled = 0
    token_counts: Dict[str, int] = {}
    for col in frame.columns:
        if frame[col].dtype == object or pd.api.types.is_string_dtype(frame[col]):
            cleaned, nulled = _clean_text_column(frame[col])
            frame[col] = cleaned
            token_counts[str(col)] = nulled
            tokens_nulled += nulled

    # Only now can an all-"n/a" column be recognised as empty.
    if len(frame.columns) > 1:
        frame = frame.dropna(axis=0, how="all")
    if len(frame) > 0:
        empty_cols = [c for c in frame.columns if frame[c].isna().all()]
    else:
        empty_cols = []

    types: List[ColumnType] = []
    for col in empty_cols:
        types.append(ColumnType(
            column=str(col), logical="empty", dtype=str(frame[col].dtype),
            reason="every value is missing — column dropped",
            missing=int(len(frame)), unique=0, dropped=True,
            tokens_nulled=token_counts.get(str(col), 0),
        ))
    if empty_cols:
        frame = frame.drop(columns=empty_cols)

    converted: List[str] = []
    for col in frame.columns:
        coerced, info = coerce_column(frame[col])
        frame[col] = coerced
        info.tokens_nulled = token_counts.get(str(col), 0)
        if info.converted_from:
            converted.append(str(col))
        types.append(info)

    frame = frame.reset_index(drop=True)

    # Keep the report in the file's column order so the UI table lines up.
    order = {name: i for i, name in enumerate(original_columns)}
    types.sort(key=lambda ct: order.get(ct.column, len(order)))

    return frame, NormalizeReport(
        column_types=types,
        dropped_columns=[str(c) for c in empty_cols],
        dropped_rows=rows_before - len(frame),
        converted_columns=converted,
        tokens_nulled=tokens_nulled,
    )
