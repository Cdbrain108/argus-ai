"""
main.py — Command-line runner for the Argus EDA pipeline.

Runs the same cleaning + univariate analysis used by the web app on a local
CSV/Excel file and writes an AI-described PDF report to disk.

Usage:
    python main.py                       # analyse demo_data.csv
    python main.py path/to/data.csv      # analyse a specific file
    python main.py data.xlsx --target Survived
"""

import argparse
import os
import sys

import pandas as pd

from data_cleaning import SmartDataCleaner
from univariate import uni_analyze_and_visualize


def load_dataframe(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        sys.exit(f"File not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext == ".csv":
        return pd.read_csv(path)
    if ext in (".xls", ".xlsx"):
        return pd.read_excel(path)
    sys.exit(f"Unsupported file type '{ext}'. Use CSV or Excel.")


def main():
    parser = argparse.ArgumentParser(description="Argus CLI - automated EDA")
    parser.add_argument(
        "file",
        nargs="?",
        default="demo_data.csv",
        help="CSV/Excel file to analyse (default: demo_data.csv)",
    )
    parser.add_argument("--target", default="", help="Optional target column name")
    args = parser.parse_args()

    df_raw = load_dataframe(args.file)
    dataset_name = os.path.splitext(os.path.basename(args.file))[0]
    print(f"Dataset: {dataset_name}  ({df_raw.shape[0]} rows x {df_raw.shape[1]} cols)")

    cleaner = SmartDataCleaner(df_raw)

    scan = cleaner.scan_missing_values()
    print("\n── Pre-clean missing-value report ──")
    print(scan.to_string(index=False))

    print("\nSanitising (junk values, whitespace, type inference)…")
    cleaner.sanitize_data()

    print("Smart imputation…")
    df_clean, warnings_list = cleaner.smart_impute()
    for warning in warnings_list:
        print(warning)

    remaining = int(cleaner.scan_missing_values()["Missing Count"].sum())
    print(f"\nBefore cleaning: {df_raw.shape}   After cleaning: {df_clean.shape}")
    print(f"Missing values remaining: {remaining}")

    print("\nRunning AI univariate analysis (requires GROQ_API_KEY)…")
    try:
        _, pdf_bytes = uni_analyze_and_visualize(df_clean, dataset_name, args.target)
    except Exception as e:
        sys.exit(f"Univariate analysis failed: {e}")

    if not pdf_bytes:
        print("No analysable columns found — PDF skipped.")
        return

    out_path = f"argus_univariate_{dataset_name}.pdf"
    with open(out_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"\n✅ Report written to {out_path}")


if __name__ == "__main__":
    main()
