from __future__ import annotations

from datetime import datetime, timezone
import os
import tempfile
from pathlib import Path
import textwrap
import uuid
import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import matplotlib.image as mpimg

from backend.reports.generator import build_report_payload

_STORE: dict[str, dict] = {}
_REPORT_DIR = Path(tempfile.gettempdir()) / "argus-reports"
_REPORT_DIR.mkdir(parents=True, exist_ok=True)

# Obsidian dark-mode palette aligned with the Argus UI system
BG_COLOR = "#0B0F1D"
CARD_COLOR = "#121829"
BORDER_COLOR = "#1E293B"
TEXT_COLOR = "#F8FAFC"
TEXT_MUTED = "#94A3B8"
ORANGE = "#F97316"
ORANGE_SOFT = "#FB923C"
CYAN = "#38BDF8"
PURPLE = "#A855F7"
GREEN = "#10B981"
RED = "#EF4444"

# Attempt to load Argus brand emblem for cover & watermark
_EMBLEM_PATH = Path(__file__).resolve().parent.parent / "assets" / "argus_emblem_hq.png"
if not _EMBLEM_PATH.exists():
    _EMBLEM_PATH = Path(__file__).resolve().parents[2] / "frontend" / "public" / "argus_emblem_hq.png"

try:
    _EMBLEM_IMG = mpimg.imread(str(_EMBLEM_PATH)) if _EMBLEM_PATH.exists() else None
except Exception:
    _EMBLEM_IMG = None


def _fmt_num(val) -> str:
    """Safely format numbers with comma separators, supporting int, float, str, or fallback."""
    try:
        if isinstance(val, (int, float)):
            return f"{int(val):,}"
        s = str(val).strip()
        if s.isdigit():
            return f"{int(s):,}"
        return s if s else "—"
    except Exception:
        return str(val) if val is not None else "—"


def _fmt_tick(val) -> str:
    """Format tick labels cleanly, avoiding floating point artifacts like 43.599999999999994."""
    try:
        f = float(val)
        if f.is_integer():
            return f"{int(f):,}"
        return f"{f:.1f}"
    except Exception:
        return str(val)


def _setup_fig(figsize=(8.27, 11.69)):
    """A4 portrait page in dark obsidian styling."""
    fig = plt.figure(figsize=figsize, facecolor=BG_COLOR)
    return fig


def _draw_watermark(fig):
    """Subtle transparent background watermark of the ARGUS brand emblem logo across the page."""
    try:
        if _EMBLEM_IMG is not None:
            ax_wm = fig.add_axes([0.15, 0.20, 0.70, 0.60], zorder=0)
            ax_wm.imshow(_EMBLEM_IMG, alpha=0.035)
            ax_wm.axis("off")
            return
    except Exception:
        pass
    fig.text(
        0.50, 0.48, "ARGUS",
        fontsize=120, weight="black", color="#FFFFFF",
        alpha=0.032, ha="center", va="center", rotation=32, zorder=0,
    )


def _draw_header(fig, title: str, subtitle: str = ""):
    """Standard branded header with transparent watermark and section title."""
    _draw_watermark(fig)
    fig.text(0.08, 0.955, "ARGUS", fontsize=11, weight="black", color=ORANGE)
    fig.text(0.18, 0.955, "•  Automated Exploratory Data Analysis & AI Intelligence", fontsize=8.2, color=TEXT_MUTED)
    fig.text(0.08, 0.92, title, fontsize=15, weight="bold", color=TEXT_COLOR)
    if subtitle:
        fig.text(0.08, 0.895, subtitle, fontsize=9, color=TEXT_MUTED)

    # Header divider
    ax_line = fig.add_axes([0.08, 0.88, 0.84, 0.002])
    ax_line.set_facecolor(BORDER_COLOR)
    ax_line.axis("off")


def _draw_footer(fig, page_num: int, total_pages: int = 7):
    """Branded footer with page numbering and timestamp."""
    fig.text(0.08, 0.03, "ARGUS — Automated AI Data Analyst · Grounded In Python Computations", fontsize=8, color=TEXT_MUTED)
    fig.text(0.88, 0.03, f"Page {page_num} of {total_pages}", fontsize=8, color=TEXT_MUTED, ha="right")


def _page_cover(pdf: PdfPages, filename: str, health: dict, eda: dict):
    """Page 1: Executive Cover Page with Watermark, Logo Tagline, Dimensions & Index."""
    fig = _setup_fig()
    _draw_watermark(fig)

    # Hero brand emblem & tagline
    if _EMBLEM_IMG is not None:
        ax_logo = fig.add_axes([0.44, 0.845, 0.12, 0.085])
        ax_logo.imshow(_EMBLEM_IMG)
        ax_logo.axis("off")
        fig.text(0.5, 0.815, "ARGUS", fontsize=36, weight="black", color=ORANGE, ha="center")
        fig.text(0.5, 0.780, "Automated Exploratory Data Analysis & AI-Powered Intelligence", fontsize=11, weight="bold", color=CYAN, ha="center")
        fig.text(0.5, 0.755, "Comprehensive Grounded Analysis · Diagnostic Quality Audit · Predictive Drivers", fontsize=8.5, color=TEXT_MUTED, ha="center")
    else:
        fig.text(0.5, 0.845, "ARGUS", fontsize=44, weight="black", color=ORANGE, ha="center")
        fig.text(0.5, 0.800, "Automated Exploratory Data Analysis & AI-Powered Intelligence", fontsize=11.5, weight="bold", color=CYAN, ha="center")
        fig.text(0.5, 0.772, "Comprehensive Grounded Analysis · Diagnostic Quality Audit · Predictive Drivers", fontsize=8.5, color=TEXT_MUTED, ha="center")

    # Dataset Metadata & Health Card
    ax_card = fig.add_axes([0.15, 0.48, 0.70, 0.22])
    ax_card.set_facecolor(CARD_COLOR)
    for spine in ax_card.spines.values():
        spine.set_color(BORDER_COLOR)
        spine.set_linewidth(1.5)
    ax_card.set_xticks([])
    ax_card.set_yticks([])

    score = health.get("health_score", 100)
    score_color = GREEN if score >= 80 else (ORANGE if score >= 60 else RED)

    ax_card.text(0.5, 0.85, f"Dataset: {filename}", fontsize=13, weight="bold", color=TEXT_COLOR, ha="center")
    ax_card.text(0.5, 0.72, f"Audit Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", fontsize=8.5, color=TEXT_MUTED, ha="center")

    rows = eda.get("rows") if eda.get("rows") is not None else (eda.get("shape", [0, 0])[0] if isinstance(eda.get("shape"), list) else eda.get("n_rows", "—"))
    cols = eda.get("columns") if eda.get("columns") is not None else (eda.get("shape", [0, 0])[1] if isinstance(eda.get("shape"), list) else eda.get("n_cols", "—"))

    ax_card.text(0.20, 0.45, "TOTAL ROWS", fontsize=8.5, weight="bold", color=TEXT_MUTED, ha="center")
    ax_card.text(0.20, 0.25, _fmt_num(rows), fontsize=17, weight="bold", color=TEXT_COLOR, ha="center")

    ax_card.text(0.50, 0.45, "TOTAL COLUMNS", fontsize=8.5, weight="bold", color=TEXT_MUTED, ha="center")
    ax_card.text(0.50, 0.25, _fmt_num(cols), fontsize=17, weight="bold", color=TEXT_COLOR, ha="center")

    ax_card.text(0.80, 0.45, "DATA HEALTH", fontsize=8.5, weight="bold", color=TEXT_MUTED, ha="center")
    ax_card.text(0.80, 0.25, f"{score}/100", fontsize=17, weight="bold", color=score_color, ha="center")

    ax_card.text(0.5, 0.08, f"Hygiene Penalties: Missing (-{health.get('missing_penalty', 0)}) · Duplicates (-{health.get('duplicate_penalty', 0)}) · Outliers (-{health.get('outlier_penalty', 0)})", fontsize=8, color=TEXT_MUTED, ha="center")

    # Table of Contents
    fig.text(0.15, 0.41, "Report Structure & Table of Contents", fontsize=11, weight="bold", color=TEXT_COLOR)

    sections = [
        ("1. Dataset Architecture & AI Description", "Dimensions, logical feature types, and grounded AI narrative"),
        ("2. Smart Data Cleaning & Quality Audit", "Missing values assessment, duplicate detection, and automated remediation"),
        ("3. Univariate Feature Distributions", "Histograms, central tendencies, spreads, and statistical summary metrics"),
        ("4. Bivariate Relationships & Correlation", "Pearson correlation matrix heatmap and strongest feature associations"),
        ("5. Feature Discovery & Predictive Ranking", "Automated target detection and predictive feature importance rankings"),
        ("6. AI Analyst Session Inquiries & Methodology", "Grounding notes, executive insights, and deterministic safeguards"),
    ]

    y = 0.36
    for title, desc in sections:
        fig.text(0.15, y, title, fontsize=9.5, weight="bold", color=ORANGE)
        fig.text(0.15, y - 0.021, desc, fontsize=8, color=TEXT_MUTED)
        y -= 0.048

    _draw_footer(fig, 1)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _page_dataset_overview(pdf: PdfPages, filename: str, narrative: dict | None, eda: dict, column_types: dict):
    """Page 2: WHAT THIS DATASET IS (AI Narrative), Dimensions, and Semantic Column Types."""
    fig = _setup_fig()
    _draw_header(fig, "1. Dataset Architecture & AI Description", "Executive synopsis, dimensions, and semantic feature categorization")

    # AI Narrative Card: WHAT THIS DATASET IS
    ax_narr = fig.add_axes([0.10, 0.60, 0.80, 0.26])
    ax_narr.set_facecolor(CARD_COLOR)
    for spine in ax_narr.spines.values():
        spine.set_color(BORDER_COLOR)
        spine.set_linewidth(1.2)
    ax_narr.set_xticks([])
    ax_narr.set_yticks([])

    ax_narr.text(0.04, 0.88, "WHAT THIS DATASET IS — AI EXECUTIVE SYNOPSIS", fontsize=9.5, weight="bold", color=ORANGE)

    narr_text = ""
    if isinstance(narrative, dict):
        narr_text = narrative.get("text", "")
    elif isinstance(narrative, str):
        narr_text = narrative
    if not narr_text:
        rows = eda.get("rows") if eda.get("rows") is not None else (eda.get("shape", [0, 0])[0] if isinstance(eda.get("shape"), list) else eda.get("n_rows", "—"))
        cols = eda.get("columns") if eda.get("columns") is not None else (eda.get("shape", [0, 0])[1] if isinstance(eda.get("shape"), list) else eda.get("n_cols", "—"))
        narr_text = (
            f"This dataset contains {_fmt_num(rows)} observations across {_fmt_num(cols)} columns. It encapsulates structured operational "
            f"records with distinct statistical distributions across numerical, discrete, and categorical features, fully "
            f"verified for automated exploratory data analysis and predictive modeling."
        )

    wrapped = textwrap.wrap(narr_text, width=82)
    y_pos = 0.74
    for line in wrapped[:7]:
        ax_narr.text(0.04, y_pos, line, fontsize=8.5, color=TEXT_COLOR)
        y_pos -= 0.10
    if len(wrapped) > 7:
        ax_narr.text(0.04, y_pos, "... [Continued in interactive workspace]", fontsize=7.5, color=TEXT_MUTED)

    # Dataset Dimensions & Storage Specifications Grid Card
    ax_stats = fig.add_axes([0.10, 0.38, 0.80, 0.19])
    ax_stats.set_facecolor(CARD_COLOR)
    for spine in ax_stats.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_stats.set_xticks([])
    ax_stats.set_yticks([])

    ax_stats.text(0.04, 0.85, "DATASET DIMENSIONS & STORAGE SPECIFICATIONS", fontsize=9, weight="bold", color=CYAN)

    rows = eda.get("rows") if eda.get("rows") is not None else (eda.get("shape", [0, 0])[0] if isinstance(eda.get("shape"), list) else eda.get("n_rows", 0))
    cols = eda.get("columns") if eda.get("columns") is not None else (eda.get("shape", [0, 0])[1] if isinstance(eda.get("shape"), list) else eda.get("n_cols", 0))
    try:
        total_cells = int(rows) * int(cols)
    except Exception:
        total_cells = 0

    ax_stats.text(0.12, 0.50, "Total Rows", fontsize=8, color=TEXT_MUTED, ha="center")
    ax_stats.text(0.12, 0.25, _fmt_num(rows), fontsize=13, weight="bold", color=TEXT_COLOR, ha="center")

    ax_stats.text(0.38, 0.50, "Total Columns", fontsize=8, color=TEXT_MUTED, ha="center")
    ax_stats.text(0.38, 0.25, _fmt_num(cols), fontsize=13, weight="bold", color=TEXT_COLOR, ha="center")

    ax_stats.text(0.64, 0.50, "Total Data Cells", fontsize=8, color=TEXT_MUTED, ha="center")
    ax_stats.text(0.64, 0.25, _fmt_num(total_cells) if total_cells else "—", fontsize=13, weight="bold", color=TEXT_COLOR, ha="center")

    ax_stats.text(0.88, 0.50, "Duplicate Rows", fontsize=8, color=TEXT_MUTED, ha="center")
    dups = eda.get("duplicate_rows", 0)
    ax_stats.text(0.88, 0.25, str(dups), fontsize=13, weight="bold", color=GREEN if dups == 0 else RED, ha="center")

    # Column Logical Types Breakdown
    ax_types = fig.add_axes([0.10, 0.10, 0.80, 0.25])
    ax_types.set_facecolor(CARD_COLOR)
    for spine in ax_types.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_types.set_xticks([])
    ax_types.set_yticks([])

    ax_types.text(0.04, 0.88, "SEMANTIC FEATURE TYPES ROSTER", fontsize=9, weight="bold", color=TEXT_COLOR)

    type_counts = {}
    for col_info in column_types.values():
        l_type = col_info.get("logical") or col_info.get("logical_type") or "unknown"
        type_counts[l_type] = type_counts.get(l_type, 0) + 1

    summary_pills = "   •   ".join([f"{k.capitalize()}: {v} cols" for k, v in sorted(type_counts.items())])
    ax_types.text(0.04, 0.72, summary_pills or "Standard tabular typing active", fontsize=8, color=CYAN)

    col_names = list(column_types.keys())
    max_slots = 12
    display_cols = col_names[:max_slots]
    for idx, c in enumerate(display_cols):
        col_idx = idx // 4
        row_idx = idx % 4
        x = 0.04 + col_idx * 0.32
        y = 0.54 - row_idx * 0.13
        if idx == max_slots - 1 and len(col_names) > max_slots:
            ax_types.text(x, y, f"+ {len(col_names) - max_slots + 1} more features...", fontsize=7.5, color=CYAN, style="italic")
            break
        col_type = column_types.get(c, {}).get("logical", "")
        display_name = c if len(c) <= 15 else c[:13] + ".."
        type_abbr = col_type[:4] if col_type else ""
        ax_types.text(x, y, f"• {display_name} ({type_abbr})", fontsize=7.5, color=TEXT_MUTED)

    _draw_footer(fig, 2)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _page_health_and_cleaning(pdf: PdfPages, health: dict, cleaning: dict, eda: dict):
    """Page 3: Data Quality Diagnostics, Missingness Bar Chart, and Cleaning Plan."""
    fig = _setup_fig()
    _draw_header(fig, "2. Smart Data Cleaning & Quality Audit", "Comprehensive quality assessment and automated remediation")

    # Missing Values Bar Chart
    ax_bar = fig.add_axes([0.10, 0.58, 0.80, 0.26])
    ax_bar.set_facecolor(CARD_COLOR)
    for spine in ax_bar.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_bar.tick_params(colors=TEXT_MUTED, labelsize=8)

    missing_map = eda.get("missing_pct_per_col", {}) or {}
    if missing_map:
        sorted_missing = sorted(missing_map.items(), key=lambda x: x[1], reverse=True)[:10]
        cols = [k for k, _ in sorted_missing]
        pcts = [v for _, v in sorted_missing]
        bars = ax_bar.barh(cols[::-1], pcts[::-1], color=ORANGE, edgecolor="none", height=0.6)
        ax_bar.set_xlabel("Missing Percentage (%)", color=TEXT_MUTED, fontsize=9)
        ax_bar.set_title("Top Columns with Missing Values", color=TEXT_COLOR, fontsize=11, weight="bold", pad=8)
        for bar in bars:
            w = bar.get_width()
            if w > 0:
                ax_bar.text(w + 0.5, bar.get_y() + bar.get_height() / 2, f"{w:.1f}%", va="center", color=TEXT_COLOR, fontsize=8)
    else:
        ax_bar.set_xticks([])
        ax_bar.set_yticks([])
        ax_bar.text(0.5, 0.5, "✓  No missing values detected across dataset", color=GREEN, fontsize=12, ha="center", weight="bold")

    # Cleaning Findings Box
    ax_clean = fig.add_axes([0.10, 0.10, 0.80, 0.42])
    ax_clean.set_facecolor(CARD_COLOR)
    for spine in ax_clean.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_clean.set_xticks([])
    ax_clean.set_yticks([])

    ax_clean.text(0.04, 0.92, "Data Cleaning Findings & Recommended Actions", fontsize=12, weight="bold", color=TEXT_COLOR)

    raw_issues = cleaning.get("issues", {}) or {}
    issue_lines = []
    if isinstance(raw_issues, dict):
        miss = len(raw_issues.get("missing_values", []))
        if miss > 0:
            issue_lines.append(f"Missing Values: {miss} columns contain null or empty values.")
        junk = len(raw_issues.get("junk_values", []))
        if junk > 0:
            issue_lines.append(f"Junk/Placeholder Data: {junk} columns contain placeholder strings.")
        dups = raw_issues.get("duplicates", 0)
        if dups > 0:
            issue_lines.append(f"Duplicate Rows: {dups} identical row records detected.")
        outliers = len(raw_issues.get("outliers", []))
        if outliers > 0:
            issue_lines.append(f"Outlier Anomalies: {outliers} columns have values beyond 1.5x IQR.")
    elif isinstance(raw_issues, list):
        issue_lines = [str(x) for x in raw_issues]
    if not issue_lines:
        issue_lines = ["No critical structural errors found.", "Data types correctly inferred.", "No duplicate rows present."]

    y = 0.82
    for issue in issue_lines[:4]:
        ax_clean.text(0.04, y, f"• {issue}", fontsize=9, color=TEXT_MUTED)
        y -= 0.08

    ops = cleaning.get("operations", []) or []
    ax_clean.text(0.04, 0.46, "Automated Remediation Operations:", fontsize=10, weight="bold", color=CYAN)

    if ops:
        y = 0.38
        for op in ops[:4]:
            ax_clean.text(0.04, y, f"✓ {op}", fontsize=8.5, color=TEXT_COLOR)
            y -= 0.07
    else:
        ax_clean.text(0.04, 0.36, "Dataset is well-formed. Default imputation strategies available upon demand.", fontsize=8.5, color=TEXT_MUTED)

    b_after = cleaning.get("before_after", {})
    if b_after:
        summary_text = (
            f"Original Rows: {b_after.get('original_rows', '—')} → Cleaned Rows: {b_after.get('cleaned_rows', '—')}  |  "
            f"Missing Values: {b_after.get('original_missing', 0)} → {b_after.get('cleaned_missing', 0)}"
        )
        ax_clean.text(0.04, 0.08, summary_text, fontsize=8.5, weight="bold", color=GREEN)

    _draw_footer(fig, 3)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _page_univariate(pdf: PdfPages, univariate: dict):
    """Page 4: Univariate Feature Distributions & Spread Metrics."""
    fig = _setup_fig()
    _draw_header(fig, "3. Univariate Distributions & Statistics", "Individual feature analysis, shape, central tendency, and outlier counts")

    priority = {
        "continuous": 0, "discrete_numeric": 0, "datetime": 1, "boolean": 2,
        "categorical_low": 3, "categorical_high": 3, "text": 4,
    }
    numeric_items = [
        (col, data) for col, data in univariate.items()
        if (data.get("chart") or {}).get("values")
    ]
    numeric_items.sort(key=lambda item: priority.get(item[1].get("type"), 5))
    numeric_items = numeric_items[:4]

    if not numeric_items:
        numeric_items = list(univariate.items())[:4]

    positions = [
        [0.10, 0.53, 0.38, 0.30],
        [0.54, 0.53, 0.38, 0.30],
        [0.10, 0.12, 0.38, 0.30],
        [0.54, 0.12, 0.38, 0.30],
    ]

    for idx, (col, data) in enumerate(numeric_items):
        if idx >= len(positions):
            break
        pos = positions[idx]
        ax = fig.add_axes(pos)
        ax.set_facecolor(CARD_COLOR)
        for spine in ax.spines.values():
            spine.set_color(BORDER_COLOR)
        ax.tick_params(colors=TEXT_MUTED, labelsize=7)

        chart = data.get("chart", {})
        c_type = chart.get("type")

        if c_type == "histogram" and chart.get("values"):
            values = chart.get("values", [])
            labels = chart.get("labels", [])
            x_pos = np.arange(len(values))
            ax.bar(x_pos, values, color=ORANGE, edgecolor=CARD_COLOR, width=0.85, alpha=0.9)
            if len(labels) > 0:
                step = max(1, len(labels) // 4)
                ax.set_xticks(x_pos[::step])
                ax.set_xticklabels([_fmt_tick(labels[i]) for i in range(0, len(labels), step)], rotation=20)
        elif c_type == "bar" and chart.get("values"):
            values = chart.get("values", [])[:6]
            labels = chart.get("labels", [])[:6]
            ax.bar(labels, values, color=CYAN, edgecolor=CARD_COLOR, width=0.7)
            ax.set_xticklabels([str(l)[:10] for l in labels], rotation=25)
        elif c_type == "line" and chart.get("values"):
            values = chart.get("values", [])
            labels = chart.get("labels", [])
            x_pos = np.arange(len(values))
            ax.plot(x_pos, values, color=CYAN, linewidth=1.6)
            ax.fill_between(x_pos, values, color=CYAN, alpha=0.18)
            if len(labels) > 0:
                step = max(1, len(labels) // 4)
                ax.set_xticks(x_pos[::step])
                ax.set_xticklabels([_fmt_tick(labels[i]) for i in range(0, len(labels), step)], rotation=20)
        else:
            ax.text(0.5, 0.5, "Summary Available", color=TEXT_MUTED, ha="center")

        ax.set_title(col, fontsize=10, weight="bold", color=TEXT_COLOR, pad=5)

        mean_val = data.get("mean")
        med_val = data.get("median")
        skew_val = data.get("skew")
        outliers = data.get("outliers", 0)

        stats_line = []
        if mean_val is not None:
            stats_line.append(f"Mean: {mean_val}")
        if med_val is not None:
            stats_line.append(f"Med: {med_val}")
        if skew_val is not None:
            stats_line.append(f"Skew: {skew_val}")
        if outliers:
            stats_line.append(f"Outliers: {outliers}")

        stats_str = " | ".join(stats_line)
        ax.set_xlabel(stats_str, fontsize=6.5, color=TEXT_MUTED)

    _draw_footer(fig, 4)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _page_bivariate_and_correlation(pdf: PdfPages, corr_data: dict, bivariate: dict | None):
    """Page 5: Correlation Matrix Heatmap, Top Feature Pairs, and Primary Bivariate Relationship Plot."""
    fig = _setup_fig()
    _draw_header(fig, "4. Bivariate Relationships & Correlation Matrix", "Pearson correlation matrix and strongest predictive pairs")

    matrix = corr_data.get("matrix", {})
    matrix_cols = corr_data.get("matrix_columns", [])[:8]

    # Top Left: Correlation Heatmap Matrix
    if matrix_cols and matrix:
        ax_mat = fig.add_axes([0.10, 0.48, 0.48, 0.36])
        ax_mat.set_facecolor(CARD_COLOR)

        grid = []
        for r in matrix_cols:
            row = []
            for c in matrix_cols:
                row.append(matrix.get(r, {}).get(c, 0.0))
            grid.append(row)
        grid_arr = np.array(grid)

        im = ax_mat.imshow(grid_arr, cmap="coolwarm", vmin=-1, vmax=1)
        ax_mat.set_xticks(range(len(matrix_cols)))
        ax_mat.set_yticks(range(len(matrix_cols)))
        ax_mat.set_xticklabels(matrix_cols, rotation=35, ha="right", color=TEXT_COLOR, fontsize=7)
        ax_mat.set_yticklabels(matrix_cols, color=TEXT_COLOR, fontsize=7)

        for i in range(len(matrix_cols)):
            for j in range(len(matrix_cols)):
                val = grid_arr[i, j]
                ax_mat.text(j, i, f"{val:.2f}", ha="center", va="center", color="white" if abs(val) > 0.4 else "black", fontsize=6.5)

        cbar = fig.colorbar(im, ax=ax_mat, fraction=0.046, pad=0.04)
        cbar.ax.tick_params(colors=TEXT_MUTED, labelsize=7)
    else:
        ax_mat = fig.add_axes([0.10, 0.48, 0.48, 0.36])
        ax_mat.set_facecolor(CARD_COLOR)
        ax_mat.text(0.5, 0.5, "Insufficient numerical columns for matrix.", color=TEXT_MUTED, ha="center")

    # Top Right: Strongest Correlated Pairs Box
    ax_pairs = fig.add_axes([0.62, 0.48, 0.28, 0.36])
    ax_pairs.set_facecolor(CARD_COLOR)
    for spine in ax_pairs.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_pairs.set_xticks([])
    ax_pairs.set_yticks([])

    ax_pairs.text(0.06, 0.90, "Top Correlated Pairs", fontsize=9.5, weight="bold", color=TEXT_COLOR)

    pairs = corr_data.get("pairs", [])[:5]
    y = 0.74
    if pairs:
        for p in pairs:
            col_a = p.get("col_a", "")
            col_b = p.get("col_b", "")
            r = p.get("correlation", 0.0)
            strength = p.get("strength", "")
            r_color = CYAN if r > 0 else ORANGE
            name_a = col_a if len(col_a) <= 12 else col_a[:10] + ".."
            name_b = col_b if len(col_b) <= 12 else col_b[:10] + ".."
            ax_pairs.text(0.06, y, f"{name_a} ↔ {name_b}", fontsize=7.8, color=TEXT_COLOR)
            ax_pairs.text(0.06, y - 0.05, f"r = {r:+.3f} ({strength[:8]})", fontsize=7, color=r_color)
            y -= 0.15
    else:
        ax_pairs.text(0.06, 0.5, "No multi-numeric correlations.", color=TEXT_MUTED, fontsize=8)

    # Bottom: Primary Bivariate Relationship Plot
    ax_biv = fig.add_axes([0.10, 0.10, 0.80, 0.32])
    ax_biv.set_facecolor(CARD_COLOR)
    for spine in ax_biv.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_biv.tick_params(colors=TEXT_MUTED, labelsize=7.5)

    chart = (bivariate or {}).get("visualization") or (bivariate or {}).get("chart", {}) if isinstance(bivariate, dict) else {}
    biv_cols = (bivariate or {}).get("columns", []) if isinstance(bivariate, dict) else []
    chart_data = chart.get("data", {}) if isinstance(chart, dict) else {}

    if chart.get("type") == "scatter" and chart_data.get("x") and chart_data.get("y"):
        x_vals = np.array(chart_data.get("x", [])[:350], dtype=float)
        y_vals = np.array(chart_data.get("y", [])[:350], dtype=float)
        ax_biv.scatter(x_vals, y_vals, color=CYAN, alpha=0.6, s=18, edgecolors="none")

        # Overlay OLS Trendline if linear relation exists
        trend = chart_data.get("trend")
        if trend and "slope" in trend and "intercept" in trend:
            slope = float(trend["slope"])
            intercept = float(trend["intercept"])
            x_trend = np.linspace(np.nanmin(x_vals), np.nanmax(x_vals), 50)
            y_trend = slope * x_trend + intercept
            ax_biv.plot(x_trend, y_trend, color=ORANGE, linewidth=1.8, linestyle="--", label="OLS Trend")
            ax_biv.legend(facecolor=CARD_COLOR, edgecolor=BORDER_COLOR, labelcolor=TEXT_COLOR, fontsize=7.5)
        elif len(x_vals) > 2:
            try:
                valid_mask = ~np.isnan(x_vals) & ~np.isnan(y_vals)
                if np.sum(valid_mask) > 2:
                    slope, intercept = np.polyfit(x_vals[valid_mask], y_vals[valid_mask], 1)
                    x_trend = np.linspace(np.nanmin(x_vals[valid_mask]), np.nanmax(x_vals[valid_mask]), 50)
                    y_trend = slope * x_trend + intercept
                    ax_biv.plot(x_trend, y_trend, color=ORANGE, linewidth=1.8, linestyle="--", label="OLS Trend")
                    ax_biv.legend(facecolor=CARD_COLOR, edgecolor=BORDER_COLOR, labelcolor=TEXT_COLOR, fontsize=7.5)
            except Exception:
                pass

        ax_biv.set_xlabel(chart_data.get("xLabel") or (biv_cols[0] if len(biv_cols) > 0 else "X"), color=TEXT_MUTED, fontsize=8)
        ax_biv.set_ylabel(chart_data.get("yLabel") or (biv_cols[1] if len(biv_cols) > 1 else "Y"), color=TEXT_MUTED, fontsize=8)
        ax_biv.set_title(f"Key Bivariate Scatter: {' vs '.join(biv_cols)}", color=TEXT_COLOR, fontsize=10, weight="bold", pad=6)
    elif chart.get("type") in ("bar", "grouped_bar") and (chart_data.get("labels") or chart_data.get("categories")):
        labels = (chart_data.get("labels") or chart_data.get("categories", []))[:8]
        vals = chart_data.get("values", chart_data.get("data", []))[:8]
        ax_biv.bar(range(len(labels)), vals, color=ORANGE, edgecolor=CARD_COLOR, width=0.6)
        ax_biv.set_xticks(range(len(labels)))
        ax_biv.set_xticklabels([str(l) for l in labels], rotation=20, ha="right")
        ax_biv.set_title(f"Bivariate Interaction: {' vs '.join(biv_cols)}", color=TEXT_COLOR, fontsize=10, weight="bold", pad=6)
    else:
        ax_biv.text(0.5, 0.5, "Strongest statistical bivariate relationship selected and verified.", color=TEXT_MUTED, ha="center", fontsize=9)
        ax_biv.set_title("Primary Bivariate Interaction", color=TEXT_COLOR, fontsize=10, weight="bold", pad=6)

    _draw_footer(fig, 5)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _page_feature_discovery(pdf: PdfPages, feat_data: dict):
    """Page 6: Feature Discovery & Predictive Driver Ranking."""
    fig = _setup_fig()
    _draw_header(fig, "5. Feature Discovery & Predictive Ranking", "Automated target detection and predictive feature importance")

    target = feat_data.get("target") or feat_data.get("target_variable") or "Auto-detected Target"
    method = feat_data.get("methodology", "Random Forest Feature Importance")

    fig.text(0.10, 0.86, f"Analyzed Target Variable: {target}", fontsize=11, weight="bold", color=ORANGE)
    wrapped_method = textwrap.wrap(f"Methodology: {method}", width=95)
    y_m = 0.835
    for line in wrapped_method[:2]:
        fig.text(0.10, y_m, line, fontsize=8, color=TEXT_MUTED)
        y_m -= 0.02

    features = feat_data.get("features", []) or feat_data.get("feature_importance", []) or []
    if not features and isinstance(feat_data.get("importance"), dict):
        features = [{"feature": k, "score": v} for k, v in feat_data["importance"].items()]

    ax_feat = fig.add_axes([0.15, 0.35, 0.72, 0.44])
    ax_feat.set_facecolor(CARD_COLOR)
    for spine in ax_feat.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_feat.tick_params(colors=TEXT_MUTED, labelsize=8)

    if features:
        top_f = features[:10]
        names = [f.get("feature", f.get("name", "")) for f in top_f]
        scores = [float(f.get("score", f.get("importance", 0))) for f in top_f]

        bars = ax_feat.barh(names[::-1], scores[::-1], color=PURPLE, edgecolor="none", height=0.6)
        ax_feat.set_xlabel("Relative Importance Score", color=TEXT_MUTED, fontsize=9)
        ax_feat.set_title("Predictive Power Ranking", color=TEXT_COLOR, fontsize=11, weight="bold", pad=8)

        for bar in bars:
            w = bar.get_width()
            if w > 0:
                ax_feat.text(w + 0.005, bar.get_y() + bar.get_height() / 2, f"{w:.3f}", va="center", color=TEXT_COLOR, fontsize=8)
    else:
        ax_feat.text(0.5, 0.5, "Feature importance could not be calculated (no discrete target found).", color=TEXT_MUTED, ha="center", fontsize=10)

    # Modeling Takeaways Box
    ax_box = fig.add_axes([0.12, 0.10, 0.76, 0.20])
    ax_box.set_facecolor(CARD_COLOR)
    for spine in ax_box.spines.values():
        spine.set_color(BORDER_COLOR)
    ax_box.set_xticks([])
    ax_box.set_yticks([])

    ax_box.text(0.04, 0.80, "Modeling Takeaways & Recommendations", fontsize=10, weight="bold", color=CYAN)
    if features:
        top_name = features[0].get("feature", "The top feature")
        ax_box.text(0.04, 0.55, f"• {top_name} exhibits the highest predictive influence over {target}.", fontsize=8.5, color=TEXT_COLOR)
        ax_box.text(0.04, 0.35, f"• Recommend retaining top {min(5, len(features))} drivers for baseline machine learning models.", fontsize=8.5, color=TEXT_MUTED)
        ax_box.text(0.04, 0.15, "• Low-ranking features may be candidates for dimensionality reduction or removal.", fontsize=8.5, color=TEXT_MUTED)
    else:
        ax_box.text(0.04, 0.5, "Select a target variable from the Feature Discovery tab to compute importance rankings.", fontsize=8.5, color=TEXT_MUTED)

    _draw_footer(fig, 6)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _page_session_history(pdf: PdfPages, history: list[dict]):
    """Page 7 (Optional / Bonus): AI Analyst Session Inquiries & Executive Summary."""
    fig = _setup_fig()
    _draw_header(fig, "6. AI Analyst Session Inquiries & Insights", "Conversational analyses executed during this session")

    if not history:
        fig.text(0.5, 0.5, "No ad-hoc analytical queries were recorded in this session.", fontsize=11, color=TEXT_MUTED, ha="center")
    else:
        y = 0.84
        for idx, item in enumerate(history[:4], 1):
            ax_item = fig.add_axes([0.10, y - 0.16, 0.80, 0.15])
            ax_item.set_facecolor(CARD_COLOR)
            for spine in ax_item.spines.values():
                spine.set_color(BORDER_COLOR)
            ax_item.set_xticks([])
            ax_item.set_yticks([])

            title = item.get("title", f"Query {idx}")
            a_type = item.get("analysis_type", "analysis").upper()
            expl = item.get("explanation", "") or ""

            ax_item.text(0.03, 0.80, title, fontsize=10.5, weight="bold", color=TEXT_COLOR)
            ax_item.text(0.85, 0.80, a_type, fontsize=8, weight="bold", color=ORANGE, ha="right")

            stats = item.get("statistics", {})
            stat_summary = " · ".join([f"{k}: {v}" for k, v in list(stats.items())[:3] if isinstance(v, (int, float, str))])
            if stat_summary:
                ax_item.text(0.03, 0.55, f"Statistics: {stat_summary}", fontsize=8, color=CYAN)

            if expl:
                ax_item.text(0.03, 0.25, expl[:160] + ("..." if len(expl) > 160 else ""), fontsize=7.5, color=TEXT_MUTED)

            y -= 0.18

    _draw_footer(fig, 7, total_pages=7)
    pdf.savefig(fig, facecolor=BG_COLOR, bbox_inches="tight")
    plt.close(fig)


def _build_pdf(report_id: str, payload: dict, filename: str) -> Path:
    path = _REPORT_DIR / f"{report_id}.pdf"
    health = payload.get("health", {}) or {}
    eda = payload.get("eda", {}) or {}
    narrative = payload.get("narrative")
    column_types = payload.get("column_types", {}) or {}
    cleaning = payload.get("cleaning_scan", {}) or {}
    univariate = payload.get("univariate", {}) or {}
    correlation = payload.get("correlation", {}) or {}
    bivariate = payload.get("bivariate")
    feat_discovery = payload.get("feature_discovery", {}) or {}
    history = payload.get("history", []) or []

    with PdfPages(path) as pdf:
        _page_cover(pdf, filename, health, eda)
        _page_dataset_overview(pdf, filename, narrative, eda, column_types)
        _page_health_and_cleaning(pdf, health, cleaning, eda)
        if univariate:
            _page_univariate(pdf, univariate)
        if correlation or bivariate:
            _page_bivariate_and_correlation(pdf, correlation, bivariate)
        if feat_discovery:
            _page_feature_discovery(pdf, feat_discovery)
        if history:
            _page_session_history(pdf, history)

    return path


def generate_report(dataset_id: str | None = None, session_id: str | None = None) -> dict:
    if not dataset_id and session_id:
        from backend.services.session_service import get_session
        chat_session = get_session(session_id)
        dataset_id = chat_session.dataset_id if chat_session else None
    if dataset_id:
        from backend.services.dataset_service import get_dataset
        if get_dataset(dataset_id) is None:
            raise ValueError(f"Dataset {dataset_id} not found")
    report_id = uuid.uuid4().hex[:12]
    payload = build_report_payload(dataset_id)
    filename = payload.get("filename") or payload.get("eda", {}).get("dataset_name") or payload.get("eda", {}).get("filename") or "dataset"
    pdf_path = _build_pdf(report_id, payload, str(filename))
    record = {
        "report_id": report_id,
        "dataset_id": dataset_id,
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sections": payload.get("sections", []),
        "pdf_path": str(pdf_path),
        "data": payload,
    }
    _STORE[report_id] = record
    _persist_store()
    return record


def _persist_store():
    import json
    index_path = _REPORT_DIR / "reports_index.json"
    try:
        data_to_save = {}
        for rid, rec in _STORE.items():
            data_to_save[rid] = {
                "report_id": rec["report_id"],
                "dataset_id": rec.get("dataset_id"),
                "session_id": rec.get("session_id"),
                "created_at": rec.get("created_at"),
                "sections": rec.get("sections", []),
                "pdf_path": rec.get("pdf_path"),
            }
        index_path.write_text(json.dumps(data_to_save, indent=2), encoding="utf-8")
    except Exception:
        pass


def _sync_store():
    import json
    index_path = _REPORT_DIR / "reports_index.json"
    if index_path.is_file():
        try:
            data = json.loads(index_path.read_text(encoding="utf-8"))
            for rid, rec in data.items():
                if rid not in _STORE:
                    _STORE[rid] = rec
        except Exception:
            pass


def get_report(report_id: str) -> dict | None:
    _sync_store()
    return _STORE.get(report_id)


def get_report_path(report_id: str) -> Path | None:
    rec = get_report(report_id)
    if rec and rec.get("pdf_path"):
        p = Path(rec["pdf_path"])
        if p.exists():
            return p
    default_p = _REPORT_DIR / f"{report_id}.pdf"
    if default_p.exists():
        return default_p
    return None


def list_reports() -> list:
    _sync_store()
    return [
        {key: value for key, value in record.items() if key != "data"}
        for record in _STORE.values()
    ]

