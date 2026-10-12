"""
input_file.py — Legacy CLI data loading (system file picker or URL).

The Streamlit app does NOT use this module; it has its own uploader in
home.py. Kept for offline/scripted use via main.py-style workflows.
"""

import io
import os
import re
from io import BytesIO
from urllib.parse import urlparse

import pandas as pd
import requests
import validators
from groq import Groq

try:
    from utils import get_groq_client, GROQ_MODEL

    client = get_groq_client()
except Exception:
    client = Groq()


def cleaning(data: pd.DataFrame) -> pd.DataFrame:
    """Normalise column names: split camelCase/underscores, lowercase, single-space."""
    clean_col_names = []
    for col in data.columns:
        clean_col = re.sub(r"[_\-]", " ", col)
        clean_col = re.sub(r"(?<!^)(?=[A-Z])", " ", col)
        clean_col = clean_col.strip()
        clean_col = clean_col.replace("_", " ")
        clean_col = re.sub(r"\s+", " ", clean_col)
        clean_col = clean_col.lower()
        clean_col_names.append(clean_col)
    data.columns = clean_col_names
    return data


def extract_file_id(drive_link: str):
    """Extract the file ID from common Google Drive link formats."""
    patterns = [
        r"/file/d/([\w-]+)",       # /file/d/<id>/view
        r"[?&]id=([\w-]+)",        # ...?id=<id>
        r"/d/([\w-]+)",            # /d/<id> (fallback)
    ]
    for pattern in patterns:
        match = re.search(pattern, drive_link)
        if match:
            return match.group(1)
    print("Invalid Google Drive link provided.")
    return None


def download_file(file_id: str) -> bytes:
    """Download raw bytes of a Google Drive file."""
    download_url = f"https://drive.google.com/uc?id={file_id}"
    response = requests.get(download_url, timeout=60)
    response.raise_for_status()
    return response.content


def _read_tabular(content: bytes, hint_url: str = ""):
    """Parse bytes as CSV or Excel (CSV first unless the URL hints otherwise)."""
    if hint_url.endswith((".xls", ".xlsx")):
        attempts = ("excel", "csv")
    else:
        attempts = ("csv", "excel")
    for kind in attempts:
        try:
            if kind == "csv":
                return pd.read_csv(io.StringIO(content.decode("utf-8")))
            return pd.read_excel(BytesIO(content))
        except Exception:
            continue
    return None


def load_data():
    """Interactive loader: pick a local file (1) or provide a URL (2)."""
    print("How would you like to input the data?")
    print("1. Browse from system")
    print("2. Provide a link to online data")
    choice = input("Enter your choice (1 or 2): ")

    if choice == "1":
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        file_path = filedialog.askopenfilename()

        if not file_path:
            print("No file selected.")
            return None, None, None

        ext = os.path.splitext(file_path)[-1].lower()
        try:
            if ext == ".csv":
                with open(file_path, "r") as f:
                    separator = re.search("[,;\t]", f.readline()).group()
                data = pd.read_csv(file_path, sep=separator)
            elif ext in (".xls", ".xlsx"):
                data = pd.read_excel(file_path)
            else:
                print("Unsupported file format. Please provide a CSV, XLS, or XLSX file.")
                return None, None, None

            if len(data.columns) == 0:
                print("Error: The file contains no columns.")
                return None, None, None

            data = cleaning(data)
            dataset_name = os.path.basename(file_path)
            target_variable = get_target_variables(data, dataset_name)
            return data, dataset_name, target_variable

        except Exception as e:
            print("Error:", e)
            return None, None, None

    elif choice == "2":
        url = input("Enter the URL of the online data: ")
        if not validators.url(url):
            print("Invalid URL. Please check the URL and try again.")
            return None, None, None
        try:
            if "drive.google.com" in url:
                file_id = extract_file_id(url)
                if file_id is None:
                    print("Could not extract a file ID from that Google Drive URL.")
                    return None, None, None
                content = download_file(file_id)
            else:
                content = requests.get(url, timeout=60).content

            data = _read_tabular(content, url)
            if data is None:
                print("Unsupported file format. Please provide a CSV, XLS, or XLSX file.")
                return None, None, None

            data = cleaning(data)
            if len(data.columns) == 0:
                print("Error: The online data contains no columns.")
                return None, None, None

            dataset_name = os.path.basename(urlparse(url).path) or "online_dataset"
            target_variable = get_target_variables(data, dataset_name)
            return data, dataset_name, target_variable

        except Exception as e:
            print("Error:", e)
            print("An error occurred. Please check the URL and try again.")
            return None, None, None

    else:
        print("No file selected.")
        return None, None, None


def get_target_variables(data, dataset_name):
    """Ask Groq to suggest the most likely single target variable."""
    df = pd.DataFrame(data)
    feature_names = [str(name) for name in df.columns.tolist()]
    prompt = (
        f"this is a dataset of {dataset_name} and overall shape of dataset is {df.shape}."
        f"The dataset contains {len(df)} records and {len(df.columns)} features. "
        f"The features include: {', '.join(feature_names)}. "
        f"The data types of features are: {', '.join(map(str, map(str, df.dtypes)))}."
    )
    prompt += f"Here are the summary statistics:\n{df.describe(include='all')}"
    prompt += (
        " Please provide most possible target varaible (only one) of dataset "
        "return in a only a single string."
    )
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        temperature=0.7,
    )
    target_variable = response.choices[0].message.content
    if not isinstance(target_variable, str):
        target_variable = str(target_variable)
    if target_variable.strip():
        print("Target variables found:", target_variable)
    else:
        print("No target variables found.")
        target_variable = None
    return target_variable
