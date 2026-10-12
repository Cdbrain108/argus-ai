"""Grounded AI narration for datasets, analyses and every graph they draw.

Three entry points:

* :func:`narrate_dataset` — the detailed description shown once, right after an
  upload, which the UI types out word by word.
* :func:`narrate_analysis` — the same treatment for every analysis the user
  runs (univariate, bivariate, correlation, multivariate, feature importance,
  health, cleaning, overview), so no result card is ever just a table.
* :func:`attach_narratives` — what the analysis pipeline actually calls: the
  description of the run *plus* a short description of each individual graph it
  drew, all issued in parallel. A univariate run over five columns draws five
  histograms, and one paragraph about "the analysis" describes none of them in
  particular; each chart therefore carries its own reading.

Both obey the rule the rest of ARGUS obeys: **the model never produces a
number.** Every figure handed to it was already computed by pandas,
scikit-learn or SciPy; the model only turns that fact sheet into plain English.

When no provider key is configured, or the provider is unreachable, the
deterministic insights each tool already returns are stitched into prose
instead. The UI therefore always has something real to type, and the payload
says which of the two it got via ``source`` — so a missing API key degrades to
a plainer description rather than to an error or an empty box.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

# ── Prose hygiene ─────────────────────────────────────────────────────────────
# Models emit markdown even when told not to, and the reasoning models we
# default to (qwen, nemotron) can prefix a <think> block. The UI types the text
# out character by character with no markdown renderer behind it, so asterisks
# and hashes would be read out literally.
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_HEADING = re.compile(r"^\s*#{1,6}\s*", re.MULTILINE)
_BULLET = re.compile(r"^\s*(?:[-*•‣●]|\d+[.)])\s+", re.MULTILINE)
_EMPHASIS = re.compile(r"(\*\*|__|\*|`+|~~)")
_BLANKS = re.compile(r"\n{3,}")
_SPACES = re.compile(r"[ \t]{2,}")

_SYSTEM = (
    "You are ARGUS, a senior data analyst explaining findings to someone who is "
    "not a statistician. You are given a fact sheet of figures already computed "
    "from the real dataset. Use only those figures: never invent, estimate or "
    "restate a number that is not in the fact sheet, and never mention the fact "
    "sheet, the prompt or yourself. Be specific and concrete — name the actual "
    "columns. Write flowing plain English prose. Do not use markdown, asterisks, "
    "hashes, bullet points, numbered lists, tables, headings, code formatting or "
    "emoji. Plain sentences only."
)

_FALLBACK_NOTES = {
    "off": "AI narration is switched off, so this description is written directly from the computed statistics.",
    "unconfigured": "No AI provider key is configured, so this description is written directly from the computed statistics.",
    "unavailable": "The AI model could not be reached, so this description is written directly from the computed statistics.",
}


def _enabled() -> bool:
    return os.getenv("ARGUS_NARRATION", "on").strip().lower() not in {"off", "0", "false", "no"}


def narration_timeout() -> float:
    """Kept tighter than the chat timeout: this call sits in the request path of
    every analysis, so it must never be the reason a result feels slow."""
    try:
        return float(os.getenv("ARGUS_NARRATION_TIMEOUT", "9"))
    except ValueError:
        return 9.0


def _plain(text: str) -> str:
    if not text:
        return ""
    text = _THINK.sub(" ", text)
    if "</think>" in text:  # an opening tag we never saw closed
        text = text.split("</think>", 1)[-1]
    text = _HEADING.sub("", text)
    text = _BULLET.sub("", text)
    text = _EMPHASIS.sub("", text)
    text = text.replace("|", " ")
    text = _SPACES.sub(" ", text)
    text = _BLANKS.sub("\n\n", text)
    return text.strip()


def _fmt(value: Any) -> str:
    """Render one already-computed value for the fact sheet."""
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return "n/a"
        if abs(value) < 1e15 and float(value).is_integer():
            return f"{int(value):,}"
        return f"{value:,.3f}".rstrip("0").rstrip(".")
    if isinstance(value, int):
        return f"{value:,}"
    return str(value).strip()[:160]


# ── Statistics → fact sheet ───────────────────────────────────────────────────
#: Chart payloads, matrices and raw column dumps are for the renderer, not for a
#: prompt: they are long, they carry no extra meaning in prose, and they would
#: crowd out the figures that do.
_SKIP_KEYS = {
    "chart", "visualization", "matrix", "matrix_values", "matrix_columns",
    "values", "labels", "data", "points", "series", "sample", "histogram",
    "bins", "counts", "explanation", "narrative", "traceback", "analysis_id",
    "column_types", "column_summary", "load_report", "preview", "head",
    "visualization_plan",
}
_MAX_LINES = 60
_MAX_KEYS = 24
_MAX_ITEMS = 8
_FACTS_CHARS = 3500


def _stat_lines(node: Any, prefix: str = "", depth: int = 0, out: Optional[List[str]] = None) -> List[str]:
    """Flatten a result's statistics into bounded ``- key: value`` lines."""
    if out is None:
        out = []
    if len(out) >= _MAX_LINES:
        return out

    if isinstance(node, dict):
        for key, value in list(node.items())[:_MAX_KEYS]:
            if str(key) in _SKIP_KEYS:
                continue
            label = f"{prefix} / {key}" if prefix else str(key)
            if isinstance(value, dict):
                if depth >= 2:
                    continue
                _stat_lines(value, label, depth + 1, out)
            elif isinstance(value, (list, tuple)):
                _stat_lines(list(value), label, depth + 1, out)
            else:
                out.append(f"- {label}: {_fmt(value)}")
            if len(out) >= _MAX_LINES:
                break
        return out

    if isinstance(node, (list, tuple)):
        items = list(node)[:_MAX_ITEMS]
        if not items:
            return out
        if all(not isinstance(item, (dict, list, tuple)) for item in items):
            out.append(f"- {prefix}: " + ", ".join(_fmt(item) for item in items))
            return out
        if depth >= 3:
            return out
        for index, item in enumerate(items):
            _stat_lines(item, f"{prefix} #{index + 1}", depth + 1, out)
            if len(out) >= _MAX_LINES:
                break
        return out

    out.append(f"- {prefix}: {_fmt(node)}")
    return out


def _facts_block(lines: List[str]) -> str:
    text = "\n".join(line for line in lines if line)
    return text[:_FACTS_CHARS]


# ── The shared LLM call ───────────────────────────────────────────────────────

def _model_name() -> Optional[str]:
    try:
        from backend.config import llm_config
        return llm_config().model
    except Exception:  # noqa: BLE001 — never let telemetry break a narrative
        return None


def _deterministic(text: str, reason: str) -> Dict[str, Any]:
    return {
        "text": text,
        "source": "deterministic",
        "model": None,
        "note": _FALLBACK_NOTES.get(reason, _FALLBACK_NOTES["unavailable"]),
    }


def _generate(prompt: str, fallback: str, max_tokens: int, temperature: float = 0.35) -> Dict[str, Any]:
    fallback = (fallback or "").strip() or "There was not enough information in this result to describe."

    if not _enabled():
        return _deterministic(fallback, "off")

    from backend.services.llm import LLMUnavailable, chat_completion, is_configured

    if not is_configured():
        return _deterministic(fallback, "unconfigured")

    timeout = narration_timeout()
    try:
        text = _plain(
            chat_completion(
                prompt,
                system_prompt=_SYSTEM,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout,
                total_budget=timeout * 2,
            )
        )
    except LLMUnavailable as exc:
        log.info("Narration fell back to deterministic prose: %s", exc)
        return _deterministic(fallback, "unavailable")
    except Exception:  # noqa: BLE001 — a narrative must never fail a request
        log.exception("Narration failed unexpectedly")
        return _deterministic(fallback, "unavailable")

    if len(text) < 40:
        # A one-word or empty reply is worse than the deterministic prose.
        return _deterministic(fallback, "unavailable")
    return {"text": text, "source": "ai", "model": _model_name(), "note": None}


# ── Dataset description ───────────────────────────────────────────────────────

def _dataset_fact_lines(session) -> tuple[List[str], Dict[str, Any]]:
    import pandas as pd

    profile = session.profile()
    df = session.df
    report = session.load_report or {}
    rows, cols = profile["rows"], profile["columns"]
    cells = max(1, rows * cols)
    missing = profile["missing_total"]

    lines: List[str] = [
        f"- dataset name: {profile['dataset_name']}",
        f"- source file: {profile['filename']}",
        f"- size: {rows:,} rows x {cols} columns",
        f"- missing cells: {missing:,} ({missing / cells * 100:.1f}% of all cells)",
        f"- fully duplicated rows: {profile['duplicate_count']:,}",
    ]

    try:
        size_kb = df.memory_usage(deep=True).sum() / 1024
        lines.append(f"- in-memory size: {size_kb:,.0f} KB")
    except Exception:  # noqa: BLE001
        pass

    for label, key in (
        ("numeric columns", "numeric_columns"),
        ("date/time columns", "datetime_columns"),
        ("true/false columns", "boolean_columns"),
        ("categorical columns", "categorical_columns"),
        ("free-text columns", "text_columns"),
        ("identifier columns", "identifier_columns"),
        ("single-valued columns", "constant_columns"),
    ):
        names = profile.get(key) or []
        if names:
            lines.append(f"- {label} ({len(names)}): " + ", ".join(str(n) for n in names[:12]))

    # What the loader had to do to the file, so the description can be honest
    # about conversions instead of presenting coerced data as if it arrived that way.
    if report.get("delimiter"):
        lines.append(f"- delimiter detected: {report['delimiter']!r}")
    if report.get("encoding"):
        lines.append(f"- text encoding detected: {report['encoding']}")
    if report.get("active_sheet"):
        lines.append(f"- Excel sheet read: {report['active_sheet']}")
    if report.get("dropped_columns"):
        lines.append("- columns dropped as empty: " + ", ".join(str(c) for c in report["dropped_columns"][:8]))
    if report.get("dropped_rows"):
        lines.append(f"- blank rows dropped: {report['dropped_rows']:,}")
    if report.get("tokens_nulled"):
        lines.append(f"- junk placeholders (n/a, NULL, ?, -) converted to missing: {report['tokens_nulled']:,}")
    for conv in (profile.get("converted_columns") or [])[:8]:
        unit = f", unit {conv['unit']}" if conv.get("unit") else ""
        lines.append(f"- converted '{conv['column']}' from {conv.get('from')} to {conv.get('to')}{unit}")

    # Per-column detail, capped so a 200-column frame cannot blow the prompt.
    for entry in (profile.get("column_summary") or [])[:20]:
        bits = [f"type {entry.get('logical_type') or entry.get('dtype')}"]
        if entry.get("missing"):
            bits.append(f"{entry['missing']:,} missing")
        bits.append(f"{entry.get('unique', 0):,} distinct")
        if entry.get("unit"):
            bits.append(str(entry["unit"]))
        lines.append(f"- column '{entry['name']}': " + ", ".join(bits))

    for col in (profile.get("numeric_columns") or [])[:8]:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if s.empty:
            continue
        lines.append(
            f"- '{col}' ranges {_fmt(float(s.min()))} to {_fmt(float(s.max()))}, "
            f"mean {_fmt(float(s.mean()))}, median {_fmt(float(s.median()))}"
        )

    for col in (profile.get("datetime_columns") or [])[:4]:
        s = df[col].dropna()
        if s.empty:
            continue
        lines.append(f"- '{col}' spans {s.min()} to {s.max()}")

    for col in (profile.get("boolean_columns") or [])[:4]:
        s = df[col].dropna()
        if s.empty:
            continue
        lines.append(f"- '{col}' is true in {float(s.astype(float).mean()) * 100:.1f}% of known rows")

    for col in (profile.get("categorical_columns") or [])[:4]:
        top = df[col].astype(str).value_counts().head(4)
        if top.empty:
            continue
        lines.append(
            f"- '{col}' top values: " + ", ".join(f"{idx} ({int(cnt):,})" for idx, cnt in top.items())
        )

    health: Dict[str, Any] = {}
    try:
        from backend.analysis.adapters import compute_dataset_health
        health = compute_dataset_health(df)
        lines.append(
            f"- computed health score: {health.get('health_score')} out of 100 "
            f"(missing penalty {health.get('missing_penalty')}, duplicate penalty "
            f"{health.get('duplicate_penalty')}, outlier penalty {health.get('outlier_penalty')}, "
            f"single-value penalty {health.get('constant_penalty')})"
        )
    except Exception:  # noqa: BLE001
        log.debug("Health score unavailable for narration", exc_info=True)

    try:
        sample = df.iloc[:4, :10].to_csv(index=False)
        lines.append("- first rows (CSV, first 10 columns only):\n" + sample[:900])
    except Exception:  # noqa: BLE001
        pass

    return lines, {"profile": profile, "health": health}


def _dataset_fallback(profile: Dict[str, Any], health: Dict[str, Any]) -> str:
    rows, cols = profile["rows"], profile["columns"]
    cells = max(1, rows * cols)
    missing = profile["missing_total"]
    groups = [
        (len(profile.get("numeric_columns") or []), "numeric"),
        (len(profile.get("datetime_columns") or []), "date/time"),
        (len(profile.get("boolean_columns") or []), "true/false"),
        (len(profile.get("categorical_columns") or []), "categorical"),
        (len(profile.get("text_columns") or []), "free-text"),
        (len(profile.get("identifier_columns") or []), "identifier"),
    ]
    shape = ", ".join(f"{count} {label}" for count, label in groups if count)

    parts = [
        f"{profile['dataset_name']} contains {rows:,} rows and {cols} columns"
        + (f" — {shape}." if shape else "."),
    ]
    if missing:
        parts.append(
            f"{missing:,} cells are missing, which is {missing / cells * 100:.1f}% of the table."
        )
    else:
        parts.append("No cells are missing.")
    if profile.get("duplicate_count"):
        parts.append(f"{profile['duplicate_count']:,} rows are exact duplicates of another row.")
    converted = profile.get("converted_columns") or []
    if converted:
        parts.append(
            "On load, "
            + "; ".join(
                f"'{c['column']}' was read as {c.get('to')} rather than text" for c in converted[:4]
            )
            + "."
        )
    if profile.get("identifier_columns"):
        parts.append(
            "Key-like columns ("
            + ", ".join(str(c) for c in profile["identifier_columns"][:4])
            + ") are excluded from statistical analysis because a key has no distribution to describe."
        )
    if health.get("health_score") is not None:
        parts.append(f"The overall data health score is {health['health_score']} out of 100.")
    if (profile.get("datetime_columns") or []) and (profile.get("numeric_columns") or []):
        parts.append(
            f"With both dates and measures present, a trend of "
            f"'{profile['numeric_columns'][0]}' over '{profile['datetime_columns'][0]}' "
            "is a good first analysis."
        )
    elif len(profile.get("numeric_columns") or []) >= 2:
        parts.append("With several numeric columns present, correlation analysis is a good first step.")
    return " ".join(parts)


def narrate_dataset(session) -> Dict[str, Any]:
    """The detailed, typed-out description shown right after an upload."""
    try:
        lines, extra = _dataset_fact_lines(session)
    except Exception:  # noqa: BLE001
        log.exception("Could not assemble dataset facts for narration")
        return _deterministic("This dataset could not be summarised.", "unavailable")

    fallback = _dataset_fallback(extra["profile"], extra["health"])
    prompt = (
        "Here is a fact sheet of measurements already computed from a dataset a "
        "user has just uploaded.\n\n"
        + _facts_block(lines)
        + "\n\nWrite a description of this dataset as four short paragraphs, no more "
        "than 150 words in total, covering in this order: what the data appears to "
        "be about and what a single row represents; what the most important columns "
        "mean; the data quality picture, including anything the loader had to convert "
        "or drop; and the single most useful analysis to run on it next. Speak to a "
        "beginner in plain English."
    )
    payload = _generate(prompt, fallback, max_tokens=420, temperature=0.4)
    payload["kind"] = "dataset"
    return payload


# ── Per-analysis description ──────────────────────────────────────────────────

_FOCUS = {
    "univariate": (
        "Describe each column analysed on its own terms: where its values sit, how "
        "spread out or skewed they are, which values dominate, and anything unusual "
        "such as outliers, imbalance or missing values. Say what that means for "
        "further analysis."
    ),
    "bivariate": (
        "Explain whether the two columns move together, how strong that relationship "
        "is, whether the test reported it as statistically significant, and what it "
        "would mean in practice. If the relationship is strong, state plainly that "
        "this is association and not proof of cause."
    ),
    "correlation": (
        "Explain which pairs of columns move together most strongly and which are "
        "effectively unrelated, call out any pair flagged as monotonic but "
        "non-linear, note any redundancy that would matter for modelling, and state "
        "plainly that correlation is not causation."
    ),
    "multivariate": (
        "Explain which features carry the most signal about the target and how much, "
        "what the clusters or components appear to separate, how much variance is "
        "actually captured, and how much confidence the reported score justifies."
    ),
    "feature_importance": (
        "Explain which features drive the target and by how much, how many features "
        "carry most of the signal, and whether the cross-validated score means the "
        "ranking can be trusted. Mention the encoding applied and anything excluded."
    ),
    "feature_discovery": (
        "Explain which column was chosen as the likely prediction target and why that "
        "is plausible, which features drive it, and how trustworthy the score is."
    ),
    "health": (
        "Explain what the score is made of — missing values, duplicates, outliers, "
        "single-valued columns — which of those is the real problem here, and the "
        "first cleaning step worth taking."
    ),
    "cleaning": (
        "Explain what was repaired and what was left alone, how the dataset changed, "
        "and what a user should check before trusting the cleaned version."
    ),
    "overview": (
        "Explain what this dataset is about, what its columns mean, its quality, and "
        "the best analysis to run next."
    ),
}
_DEFAULT_FOCUS = (
    "Explain what this result shows, what the numbers mean in plain terms, and what "
    "the user should do with it next."
)


def _analysis_fallback(result: Dict[str, Any]) -> str:
    insights = [str(i).strip() for i in (result.get("insights") or []) if str(i).strip()]
    if insights:
        text = " ".join(insights)
    else:
        # No tool-written insights: fall back to the raw computed figures rather
        # than to an empty box.
        figures = "; ".join(line[2:] for line in _stat_lines(result.get("statistics") or {})[:6])
        text = (
            f"{result.get('title') or 'This analysis'} computed: {figures}."
            if figures
            else "This analysis completed but produced no summarisable findings."
        )
    warnings = [str(w).strip() for w in (result.get("warnings") or []) if str(w).strip()]
    extra = [w for w in warnings if w not in insights]
    if extra:
        text += " Note: " + " ".join(extra[:2])
    return text


def _analysis_job(result: Dict[str, Any], session=None) -> tuple:
    """Build the prompt/fallback pair for the card-level description.

    Split out of :func:`narrate_analysis` so the card description and every
    per-graph description below can be issued from one thread pool, instead of
    queueing one provider round trip behind another.
    """
    analysis_type = str(result.get("analysis_type") or "").strip()
    lines: List[str] = [f"- analysis: {result.get('title') or analysis_type}"]
    if result.get("columns"):
        lines.append("- columns analysed: " + ", ".join(str(c) for c in result["columns"][:12]))
    if session is not None:
        try:
            lines.append(
                f"- dataset: {session.dataset_name or session.filename}, "
                f"{len(session.df):,} rows x {len(session.df.columns)} columns"
            )
        except Exception:  # noqa: BLE001
            pass
    if result.get("methodology"):
        lines.append(f"- method used: {result['methodology']}")
    lines.extend(_stat_lines(result.get("statistics") or {}))
    for insight in (result.get("insights") or [])[:10]:
        lines.append(f"- finding: {insight}")
    for warning in (result.get("warnings") or [])[:4]:
        lines.append(f"- caveat: {warning}")

    fallback = _analysis_fallback(result)
    focus = _FOCUS.get(analysis_type, _DEFAULT_FOCUS)
    prompt = (
        f"Here is a fact sheet from a {analysis_type.replace('_', ' ')} analysis that "
        "has already been computed on the user's real dataset.\n\n"
        + _facts_block(lines)
        + "\n\n"
        + focus
        + " Write two short paragraphs, no more than 110 words in total, in plain "
        "English for someone who is not a statistician."
    )
    return prompt, fallback, 340, 0.35


def narrate_analysis(result: Dict[str, Any], session=None) -> Optional[Dict[str, Any]]:
    """The typed-out description attached to every analysis result card.

    Returns ``None`` when there is nothing to narrate — a failed tool run
    already shows its own error, and an AI paragraph about it would only be
    guessing.
    """
    if not isinstance(result, dict):
        return None
    analysis_type = str(result.get("analysis_type") or "").strip()
    if not analysis_type or analysis_type == "error" or result.get("error"):
        return None

    try:
        prompt, fallback, max_tokens, temperature = _analysis_job(result, session)
        payload = _generate(prompt, fallback, max_tokens=max_tokens, temperature=temperature)
    except Exception:  # noqa: BLE001 — narration must never fail the analysis
        log.exception("Could not narrate %s result", analysis_type)
        return None

    payload["kind"] = analysis_type
    return payload


# ── Per-graph description ─────────────────────────────────────────────────────
# One paragraph about a run as a whole says nothing in particular about any one
# picture in it, and a single run can draw several: a histogram per column
# analysed, a feature ranking beside a cluster scatter. So every chart also
# carries its own short description of what that chart shows.
#
# The reading of each chart — which bin is tallest and how much of the data sits
# in it, how much of the total the top three bars hold, the net change from the
# first point on a line to the last — is computed here, in Python, over the exact
# values that were plotted. The model is handed that reading in words and asked
# what it means. It never receives the axis arrays themselves, because reading a
# number off an array is precisely where a model starts inventing them.

_MAX_CHART_NARRATIVES = 8
_CHART_FACTS_CHARS = 1800

#: ``visualization.type`` — what the renderer dispatches on — mapped to how the
#: picture should be read.
_CHART_KINDS = {
    "histogram": "histogram",
    "bar": "bar",
    "line": "line",
    "scatter": "scatter",
    "heatmap": "heatmap",
    "clusters": "clusters",
    "hbar": "ranking",
    "ranking": "ranking",
}

#: A y-axis of counts can be read as shares of a whole; an axis of group means
#: cannot, and "this bar holds 30% of the total" would be nonsense there.
_COUNT_AXES = {"frequency", "count", "counts", "records", "rows", "n", "observations"}


def _num(value: Any) -> Optional[float]:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if out != out or out in (float("inf"), float("-inf")):
        return None
    return out


def _floats(seq: Any) -> List[float]:
    if not isinstance(seq, (list, tuple)):
        return []
    return [v for v in (_num(item) for item in seq) if v is not None]


def _plotted(chart: Dict[str, Any]) -> tuple[List[str], List[float]]:
    """The plotted series as aligned label/value lists, with the gaps dropped."""
    raw = chart.get("values")
    if not isinstance(raw, (list, tuple)):
        raw = chart.get("data")
    if not isinstance(raw, (list, tuple)):
        return [], []
    labels = [str(item) for item in (chart.get("labels") or [])]
    out_labels: List[str] = []
    out_values: List[float] = []
    for index, item in enumerate(raw):
        value = _num(item)
        if value is None:
            continue
        out_labels.append(labels[index] if index < len(labels) else str(index + 1))
        out_values.append(value)
    return out_labels, out_values


def _share(part: float, whole: float) -> str:
    return f"{part / whole * 100:.1f}%" if whole else "n/a"


def _counts_axis(label: str) -> bool:
    text = (label or "").strip().lower()
    if not text:
        return True
    return (
        text in _COUNT_AXES
        or text.startswith("count")
        or text.startswith("freq")
        or text.startswith("number")
    )


def _stat_context(result: Dict[str, Any], keys: tuple) -> List[str]:
    """The handful of already-computed test figures that belong to this picture."""
    stats = result.get("statistics")
    if not isinstance(stats, dict):
        return []
    return [
        f"- {key.replace('_', ' ')}: {_fmt(stats[key])}"
        for key in keys
        if stats.get(key) is not None
    ]


# ── Reading each kind of picture ──────────────────────────────────────────────

def _read_histogram(labels, values, column) -> tuple[List[str], str]:
    total = sum(values)
    peak = max(range(len(values)), key=lambda i: values[i])
    below, above = sum(values[:peak]), sum(values[peak + 1:])
    sparse = sum(1 for v in values if v <= total * 0.01)
    if above > below * 1.3:
        shape = "most rows sit at the low end with a tail stretching to the right"
    elif below > above * 1.3:
        shape = "most rows sit at the high end with a tail stretching to the left"
    else:
        shape = "the rows are spread fairly evenly either side of the peak"
    lines = [
        f"- chart: a histogram of '{column}', drawn as {len(values)} bins",
        f"- bins run from {labels[0]} up to {labels[-1]}",
        f"- rows plotted in total: {_fmt(total)}",
        f"- tallest bin begins at {labels[peak]} and holds {_fmt(values[peak])} rows "
        f"({_share(values[peak], total)} of them)",
        f"- rows in bins below the tallest: {_share(below, total)}; above it: {_share(above, total)}",
        f"- first bin holds {_fmt(values[0])} rows; last bin holds {_fmt(values[-1])} rows",
        f"- bins holding 1% or less of the rows: {sparse} of {len(values)}",
        f"- shape a reader can see: {shape}",
    ]
    fallback = (
        f"The distribution of {column} is drawn across {len(values)} bins covering "
        f"{_fmt(total)} rows. The tallest bin begins at {labels[peak]} and holds "
        f"{_share(values[peak], total)} of them, and {shape}."
    )
    return lines, fallback


def _read_bar(labels, values, column, x_label, y_label) -> tuple[List[str], str]:
    order = sorted(range(len(values)), key=lambda i: values[i], reverse=True)
    high, low = order[0], order[-1]

    if _counts_axis(y_label):
        total = sum(values)
        top = order[:3]
        lines = [
            f"- chart: a bar chart of '{column}', {len(values)} bars drawn",
            f"- rows plotted across all bars: {_fmt(total)}",
            f"- tallest bar: {labels[high]} at {_fmt(values[high])} rows "
            f"({_share(values[high], total)} of them)",
            f"- shortest bar: {labels[low]} at {_fmt(values[low])} rows "
            f"({_share(values[low], total)} of them)",
            "- largest bars in order: "
            + "; ".join(f"{labels[i]} {_share(values[i], total)}" for i in top),
            f"- the top {len(top)} of {len(values)} bars together hold "
            f"{_share(sum(values[i] for i in top), total)} of the rows",
        ]
        fallback = (
            f"{column} is drawn as {len(values)} bars over {_fmt(total)} rows. "
            f"'{labels[high]}' is the largest at {_share(values[high], total)} and "
            f"'{labels[low]}' the smallest at {_share(values[low], total)}, with the top "
            f"three together covering {_share(sum(values[i] for i in top), total)} of the rows."
        )
        return lines, fallback

    mean = sum(values) / len(values)
    lines = [
        f"- chart: a bar chart of {y_label} by {x_label}, {len(values)} bars drawn",
        f"- tallest bar: {labels[high]} at {_fmt(values[high])}",
        f"- shortest bar: {labels[low]} at {_fmt(values[low])}",
        f"- spread between the tallest and shortest bar: {_fmt(values[high] - values[low])}",
        f"- average across the bars: {_fmt(mean)}",
        "- bars from highest to lowest: "
        + ", ".join(f"{labels[i]} {_fmt(values[i])}" for i in order[:5]),
    ]
    fallback = (
        f"Across {len(values)} groups, {y_label or 'the measure'} is highest for "
        f"'{labels[high]}' at {_fmt(values[high])} and lowest for '{labels[low]}' at "
        f"{_fmt(values[low])}, a spread of {_fmt(values[high] - values[low])}."
    )
    return lines, fallback


def _read_line(labels, values, x_label, y_label) -> tuple[List[str], str]:
    first, last = values[0], values[-1]
    change = last - first
    hi = max(range(len(values)), key=lambda i: values[i])
    lo = min(range(len(values)), key=lambda i: values[i])
    ups = sum(1 for i in range(1, len(values)) if values[i] > values[i - 1])
    downs = sum(1 for i in range(1, len(values)) if values[i] < values[i - 1])
    direction = "risen" if change > 0 else "fallen" if change < 0 else "stayed level"
    pct = f" ({change / abs(first) * 100:+.1f}%)" if first else ""
    lines = [
        f"- chart: a line of {y_label or 'value'} over {x_label or 'time'}, "
        f"{len(values)} points drawn",
        f"- first point ({labels[0]}): {_fmt(first)}; last point ({labels[-1]}): {_fmt(last)}",
        f"- net movement across the whole line: {direction} by {_fmt(abs(change))}{pct}",
        f"- highest point: {labels[hi]} at {_fmt(values[hi])}; lowest point: {labels[lo]} "
        f"at {_fmt(values[lo])}",
        f"- steps up: {ups}; steps down: {downs}; unchanged: "
        f"{max(0, len(values) - 1 - ups - downs)}",
    ]
    if len(values) > 1:
        jump = max(range(1, len(values)), key=lambda i: abs(values[i] - values[i - 1]))
        lines.append(
            f"- largest single move: {labels[jump - 1]} to {labels[jump]}, "
            f"{_fmt(values[jump] - values[jump - 1])}"
        )
    fallback = (
        f"Over {len(values)} points from {labels[0]} to {labels[-1]}, "
        f"{y_label or 'the value'} has {direction} by {_fmt(abs(change))}{pct}, peaking at "
        f"{_fmt(values[hi])} around {labels[hi]} and bottoming at {_fmt(values[lo])} "
        f"around {labels[lo]}."
    )
    return lines, fallback


def _read_scatter(chart: Dict[str, Any], result: Dict[str, Any]) -> tuple[List[str], str]:
    xs, ys = _floats(chart.get("x")), _floats(chart.get("y"))
    if not xs or not ys:
        return [], ""
    x_label = str(chart.get("xLabel") or "X")
    y_label = str(chart.get("yLabel") or "Y")
    drawn = chart.get("plotted") or min(len(xs), len(ys))
    slope = _num((chart.get("trend") or {}).get("slope"))
    lines = [
        f"- chart: a scatter plot of '{y_label}' against '{x_label}', {_fmt(drawn)} points drawn",
        f"- '{x_label}' runs from {_fmt(min(xs))} to {_fmt(max(xs))}",
        f"- '{y_label}' runs from {_fmt(min(ys))} to {_fmt(max(ys))}",
    ]
    if slope is not None:
        heading = "upwards" if slope > 0 else "downwards" if slope < 0 else "flat"
        lines.append(
            f"- the fitted straight line points {heading}: '{y_label}' changes by "
            f"{_fmt(slope)} for every 1 unit of '{x_label}'"
        )
    lines.extend(_stat_context(result, (
        "pearson_r", "p_value", "r_squared", "spearman_rho", "n",
    )))

    stats = result.get("statistics") if isinstance(result.get("statistics"), dict) else {}
    r = _num(stats.get("pearson_r"))
    if r is not None:
        strength = "strong" if abs(r) >= 0.5 else "moderate" if abs(r) >= 0.3 else "weak"
        fallback = (
            f"The scatter of {y_label} against {x_label} draws {_fmt(drawn)} points and shows a "
            f"{strength} {'upward' if r > 0 else 'downward'} pattern, with a correlation of "
            f"{_fmt(r)}. That is association, not proof of cause."
        )
    else:
        fallback = (
            f"The scatter of {y_label} against {x_label} draws {_fmt(drawn)} points, with "
            f"{x_label} between {_fmt(min(xs))} and {_fmt(max(xs))} and {y_label} between "
            f"{_fmt(min(ys))} and {_fmt(max(ys))}."
        )
    return lines, fallback


def _read_heatmap(result: Dict[str, Any]) -> tuple[List[str], str]:
    stats = result.get("statistics")
    if not isinstance(stats, dict):
        return [], ""
    cols = stats.get("matrix_columns") or stats.get("numeric_columns") or []
    method = stats.get("method", "pearson")
    pairs = [p for p in (stats.get("pairs") or []) if isinstance(p, dict)]
    lines = [
        f"- chart: a {method} correlation heatmap, {len(cols)} columns by {len(cols)} columns",
        "- columns on both axes: " + ", ".join(str(c) for c in cols[:14]),
        f"- pairs screened in total: {_fmt(stats.get('all_pairs_count') or len(pairs))}",
    ]
    for pair in pairs[:4]:
        lines.append(
            f"- {pair.get('col_a')} against {pair.get('col_b')}: "
            f"r = {_fmt(pair.get('correlation'))} ({pair.get('strength')})"
        )
    if len(pairs) > 1:
        weakest = min(pairs, key=lambda p: abs(_num(p.get("correlation")) or 0.0))
        lines.append(
            f"- weakest of the pairs listed: {weakest.get('col_a')} against "
            f"{weakest.get('col_b')}, r = {_fmt(weakest.get('correlation'))}"
        )
    for pair in (stats.get("nonlinear_pairs") or [])[:2]:
        if isinstance(pair, dict):
            lines.append(
                f"- {pair.get('col_a')} against {pair.get('col_b')} is monotonic but not a "
                f"straight line (Spearman {_fmt(pair.get('spearman_rho'))} against Pearson "
                f"{_fmt(pair.get('correlation'))})"
            )

    if pairs:
        top = pairs[0]
        fallback = (
            f"The {method} heatmap covers {len(cols)} columns. The strongest listed pair is "
            f"{top.get('col_a')} against {top.get('col_b')} at r = "
            f"{_fmt(top.get('correlation'))} ({top.get('strength')}); the rest are weaker. "
            "Colour here means association, not cause."
        )
    else:
        fallback = (
            f"The heatmap covers {len(cols)} columns, but no pair of them varied enough "
            "together to produce a meaningful correlation."
        )
    return lines, fallback


def _read_clusters(chart: Dict[str, Any]) -> tuple[List[str], str]:
    variance = _floats(chart.get("explained_variance"))
    total = _num(chart.get("explained_variance_total"))
    if total is None and variance:
        total = sum(variance)
    sizes = {str(k): (_num(v) or 0.0) for k, v in (chart.get("cluster_sizes") or {}).items()}
    points = chart.get("points") or []
    features = chart.get("features_used") or []
    groups = chart.get("n_clusters") or len(sizes)
    lines = [
        f"- chart: a scatter of the two principal components, {len(points)} rows drawn as points",
        f"- numeric columns compressed into those two axes ({len(features)}): "
        + ", ".join(str(f) for f in features[:12]),
    ]
    if variance:
        lines.append(
            "- variance kept: "
            + ", ".join(f"component {i + 1} {v * 100:.1f}%" for i, v in enumerate(variance))
            + (f", together {total * 100:.1f}%" if total is not None else "")
        )
    if sizes:
        lines.append(
            f"- K-Means found {groups} groups, sized "
            + ", ".join(f"group {k}: {_fmt(v)} rows" for k, v in list(sizes.items())[:8])
        )
    for axis, key in (("1", "pc1_drivers"), ("2", "pc2_drivers")):
        drivers = [d for d in (chart.get(key) or []) if isinstance(d, dict)][:3]
        if drivers:
            lines.append(
                f"- component {axis} is driven mainly by "
                + ", ".join(
                    f"{d.get('feature')} (loading {_fmt(d.get('loading'))})" for d in drivers
                )
            )

    kept = f"{total * 100:.1f}% of their variation" if total is not None else "part of their variation"
    if sizes:
        biggest = max(sizes.items(), key=lambda kv: kv[1])
        tail = (
            f" K-Means split the {_fmt(sum(sizes.values()))} plotted rows into {groups} "
            f"groups, the largest holding {_fmt(biggest[1])} rows."
        )
    else:
        tail = ""
    fallback = (
        f"The two axes drawn here compress {len(features)} numeric columns and keep {kept}."
        + tail
    )
    return lines, fallback


def _read_ranking(chart: Dict[str, Any], result: Dict[str, Any]) -> tuple[List[str], str]:
    target = chart.get("target") or (result.get("columns") or [None])[0] or "the target"
    scored: List[tuple] = []
    for item in chart.get("features") or []:
        if not isinstance(item, dict):
            continue
        score = _num(item.get("importance"))
        if score is None:
            score = _num(item.get("score"))
        if score is None:
            continue
        scored.append((str(item.get("feature") or item.get("name") or "?"), score))
    if not scored:
        return [], ""

    total = sum(score for _, score in scored) or 1.0
    top3 = sum(score for _, score in scored[:3])
    # Percentages here are the importance the bars are actually labelled with on
    # screen, not shares of the drawn subset: multivariate publishes only its top
    # ten influencers, and rescaling those to 100% would contradict the chart.
    lines = [
        f"- chart: a horizontal ranking of the {len(scored)} strongest predictors of "
        f"'{target}', longest bar at the top",
        "- ranking: "
        + "; ".join(
            f"#{i + 1} {name} at {score * 100:.1f}% importance"
            for i, (name, score) in enumerate(scored[:6])
        ),
        f"- the top three bars together carry {top3 * 100:.1f}% of the model's importance",
        f"- all {len(scored)} bars drawn add up to {total * 100:.1f}%",
        f"- shortest bar drawn: {scored[-1][0]} at {scored[-1][1] * 100:.1f}%",
    ]
    lines.extend(_stat_context(result, (
        "task", "model", "n_features", "sample_size", "drivers_for_80pct",
        "cv_accuracy", "baseline_accuracy", "cv_r_squared", "r_squared",
    )))
    fallback = (
        f"The ranking puts {scored[0][0]} first at {scored[0][1] * 100:.1f}% of the importance "
        f"behind {target}"
        + (", followed by " + " and ".join(name for name, _ in scored[1:3]) if len(scored) > 1 else "")
        + f". The top three bars together carry {top3 * 100:.1f}%."
    )
    return lines, fallback


# ── Which pictures a result draws, and where each description belongs ─────────

def _chart_specs(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Enumerate the graphs this result will render, in the order they appear.

    Mirrors the renderer's own dispatch. A ``multi`` visualization draws one
    graph per entry, and each entry carries its own ``narrative``; anything else
    draws a single graph whose description hangs off the result itself as
    ``chart_narrative``.
    """
    specs: List[Dict[str, Any]] = []
    viz = result.get("visualization")
    atype = str(result.get("analysis_type") or "")
    stats = result.get("statistics") if isinstance(result.get("statistics"), dict) else {}

    if isinstance(viz, dict) and viz.get("type") == "multi":
        for chart in viz.get("charts") or []:
            if not isinstance(chart, dict):
                continue
            kind = _CHART_KINDS.get(str(chart.get("type") or ""))
            if kind is None:
                continue
            specs.append({
                "kind": kind,
                "title": str(chart.get("title") or chart.get("column") or "Chart"),
                "column": str(chart.get("column") or ""),
                "chart": chart,
                "slot": chart,
                "slot_key": "narrative",
            })
        return specs

    if isinstance(viz, dict) and _CHART_KINDS.get(str(viz.get("type") or "")):
        columns = result.get("columns") or []
        specs.append({
            "kind": _CHART_KINDS[str(viz["type"])],
            "title": str(result.get("title") or "Chart"),
            "column": str(columns[0]) if columns else "",
            "chart": viz.get("data") if isinstance(viz.get("data"), dict) else {},
            "slot": result,
            "slot_key": "chart_narrative",
        })
        return specs

    # Correlation and importance draw a picture straight out of `statistics`,
    # with no `visualization` key for the renderer to dispatch on.
    if atype == "correlation" or stats.get("matrix_values") or stats.get("matrix"):
        specs.append({
            "kind": "heatmap",
            "title": "Correlation heatmap",
            "column": "",
            "chart": {},
            "slot": result,
            "slot_key": "chart_narrative",
        })
        return specs

    ranked = stats.get("feature_importance") or stats.get("top_influencers")
    if atype in ("feature_importance", "feature_discovery") and ranked:
        specs.append({
            "kind": "ranking",
            "title": "Feature importance",
            "column": str(stats.get("target") or ""),
            "chart": {"features": ranked, "target": stats.get("target")},
            "slot": result,
            "slot_key": "chart_narrative",
        })
    return specs


def _chart_job(spec: Dict[str, Any], result: Dict[str, Any]) -> Optional[tuple]:
    """Read one picture into a fact sheet, then into a prompt/fallback pair."""
    chart = spec.get("chart") or {}
    kind = spec["kind"]
    column = spec.get("column") or chart.get("xLabel") or spec.get("title") or "this column"
    x_label = str(chart.get("xLabel") or column)
    y_label = str(chart.get("yLabel") or "")

    if kind == "scatter":
        lines, fallback = _read_scatter(chart, result)
    elif kind == "heatmap":
        lines, fallback = _read_heatmap(result)
    elif kind == "clusters":
        lines, fallback = _read_clusters(chart)
    elif kind == "ranking":
        lines, fallback = _read_ranking(chart, result)
    else:
        labels, values = _plotted(chart)
        if not values:
            return None
        if kind == "histogram":
            lines, fallback = _read_histogram(labels, values, column)
        elif kind == "line":
            lines, fallback = _read_line(labels, values, x_label, y_label)
        else:
            lines, fallback = _read_bar(labels, values, column, x_label, y_label)

    if not lines:
        return None

    prompt = (
        "A chart has just been drawn on screen for the user, from their own data. "
        "Below is a reading of that one chart, measured directly from the values "
        "that were plotted.\n\n"
        + "\n".join(line for line in lines if line)[:_CHART_FACTS_CHARS]
        + "\n\nDescribe this single chart: the shape a reader can see in it, the one "
        "thing that stands out most, and what that means in practice for this data. "
        "Write one paragraph of at most 65 words. Do not restate the list above line "
        "by line, do not mention any other chart, and do not open with a phrase like "
        "'this chart shows'."
    )
    return prompt, fallback, 190, 0.3


# ── The one call the analysis pipeline makes ──────────────────────────────────

def _run_narration(result: Dict[str, Any], session=None, include_card: bool = True) -> int:
    """Issue the card description and every per-graph description together.

    Returns the number of graph descriptions written. One provider round trip
    per graph, all in flight at once: a five-column univariate run would
    otherwise queue six sequential timeouts into the request path of one click.
    """
    from concurrent.futures import ThreadPoolExecutor

    analysis_type = str(result.get("analysis_type") or "").strip()
    jobs: List[tuple] = []  # (spec or None, prompt, fallback, max_tokens, temperature)

    if include_card:
        try:
            jobs.append((None,) + _analysis_job(result, session))
        except Exception:  # noqa: BLE001
            log.exception("Could not assemble the card fact sheet for %s", analysis_type)

    try:
        specs = _chart_specs(result)[:_MAX_CHART_NARRATIVES]
    except Exception:  # noqa: BLE001
        log.exception("Could not enumerate the charts of a %s result", analysis_type)
        specs = []

    for spec in specs:
        try:
            job = _chart_job(spec, result)
        except Exception:  # noqa: BLE001
            log.exception("Could not read chart '%s' for narration", spec.get("title"))
            continue
        if job:
            jobs.append((spec,) + job)

    if not jobs:
        return 0

    def run(job: tuple) -> Optional[Dict[str, Any]]:
        _, prompt, fallback, max_tokens, temperature = job
        try:
            return _generate(prompt, fallback, max_tokens=max_tokens, temperature=temperature)
        except Exception:  # noqa: BLE001 — one failed paragraph must not sink the rest
            log.exception("A narration job failed")
            return None

    if len(jobs) == 1:
        payloads = [run(jobs[0])]
    else:
        with ThreadPoolExecutor(max_workers=min(6, len(jobs))) as pool:
            payloads = list(pool.map(run, jobs))

    written = 0
    for job, payload in zip(jobs, payloads):
        if not payload:
            continue
        spec = job[0]
        if spec is None:
            payload["kind"] = analysis_type
            result["narrative"] = payload
            continue
        payload["kind"] = "chart"
        payload["chart_title"] = spec["title"]
        slot = spec["slot"]
        if isinstance(slot, dict):
            slot[spec["slot_key"]] = payload
            written += 1
    return written


def narrate_charts(result: Dict[str, Any], session=None) -> int:
    """Describe every graph in ``result`` without touching the card description."""
    if not isinstance(result, dict):
        return 0
    return _run_narration(result, session, include_card=False)


def attach_narratives(result: Dict[str, Any], session=None) -> Dict[str, Any]:
    """Describe an analysis and each graph it draws, mutating ``result`` in place.

    ``result["narrative"]`` is the description of the run as a whole. Every graph
    also gets its own: inline on each entry of a ``multi`` visualization, or as
    ``result["chart_narrative"]`` when the result draws a single picture.
    """
    if not isinstance(result, dict):
        return result
    analysis_type = str(result.get("analysis_type") or "").strip()
    if not analysis_type or analysis_type == "error" or result.get("error"):
        return result
    try:
        _run_narration(result, session, include_card=True)
    except Exception:  # noqa: BLE001 — a missing description must not fail the analysis
        log.exception("Narration failed for %s", analysis_type)
    return result
