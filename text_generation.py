"""
text_generation.py — Groq LLM helpers for dataset summaries,
column type correction, and univariate column selection.
"""

import ast
import json
import random
import re
import warnings

import pandas as pd

from utils import get_groq_client, GROQ_MODEL

warnings.filterwarnings("ignore")

try:
    _client = get_groq_client()
except Exception:
    _client = None


def _get_client():
    """Lazily build the Groq client and raise a clear error if unavailable."""
    global _client
    if _client is None:
        try:
            _client = get_groq_client()
        except Exception as e:
            raise RuntimeError(
                "Groq client unavailable. Set GROQ_API_KEY in secrets or environment."
            ) from e
    return _client


def parse_literal(text: str, expect: str = "dict"):
    """
    Safely extract a Python literal (dict/list) from an LLM response.
    Falls back to JSON parsing; returns None when nothing valid is found.
    """
    if not text:
        return None
    pattern = r"\{.*\}" if expect == "dict" else r"\[.*\]"
    match = re.search(pattern, text, re.DOTALL)
    candidate = match.group(0) if match else text.strip()
    for parser in (ast.literal_eval, json.loads):
        try:
            return parser(candidate)
        except Exception:
            continue
    return None


class AI:
    def __init__(self):
        pass

    def data_summary(self, df: pd.DataFrame, dataset_name: str, target_variable):
        """Print an LLM-generated plain-English summary of the dataset."""
        num_records = len(df)
        num_features = len(df.columns)
        feature_names = [str(name) for name in df.columns.tolist()]
        data_types_str = [str(dtype) for dtype in df.dtypes.tolist()]
        missing_values = df.isnull().sum().tolist()
        dataset_shape = df.shape
        if target_variable is None:
            target_variable = "not provided"

        prompt = (
            f"this is a dataset of {dataset_name} and it has a target variable "
            f"{target_variable} overall shape of dataset is {dataset_shape}."
            f"The dataset contains {num_records} records and {num_features} features. "
            f"The features include: {', '.join(feature_names)}. "
            f"The data types of features are: {', '.join(map(str, data_types_str))}."
        )
        prompt += (
            f" Total missing values in each feature are: "
            f"{', '.join(map(str, missing_values))}. Here are the summary statistics:\n"
            f"{df.describe(include='all')}"
        )
        prompt += " Please provide a Summary of overall dataset in simple words"

        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
        )
        print(response.choices[0].message.content)

    def object_correction(self, dataset_name: str, target_variable, objects: dict) -> dict:
        """Ask the LLM for correct pandas dtypes for object columns."""
        if target_variable is None:
            target_variable = "not provided"
        prompt = (
            f"This dataset is named {dataset_name} and it includes target variables "
            f"{target_variable}. The following dictionary {objects} contains column names "
            f"of Object data types along with their unique data values. Please analyze the "
            f"correct data type for each column and return a dictionary with the column names "
            f"(original as given in input set) and their corresponding pandas data types "
            f"(e.g., category, float, datetime, etc.). RETURN STRICTLY A RAW VALID PYTHON "
            f"DICTIONARY STARTING WITH '{{' AND ENDING WITH '}}'. DO NOT ADD ANY CONVERSATIONAL "
            f"TEXT, EXPLANATION, OR MARKDOWN BLOCK."
        )
        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
        )
        parsed = parse_literal(response.choices[0].message.content, expect="dict")
        return parsed if isinstance(parsed, dict) else {}

    def uni_poss_corr(self, df: pd.DataFrame, dataset_name: str, target_variable):
        """Ask the LLM which columns are worth plotting (univariate). Returns list or None."""
        dataset_columns = df.columns.tolist()
        data_types = df.dtypes.tolist()
        max_unique_values = 10
        object_columns = {}
        for col in df.columns:
            unique_values = df[col].unique().tolist()
            if len(unique_values) > max_unique_values:
                unique_values = random.sample(unique_values, max_unique_values)
                object_columns[col] = unique_values
        prompt = (
            f"This dataset is named {dataset_name} and it includes target variable "
            f"{target_variable}. here are the data columns {dataset_columns} in dataframe "
            f"with their {data_types} datatypes i want a list of datacolumns at which graph "
            f"plotting (for univariate) is possibe means ignore name,id,passengerid,and another "
            f"unusual data column names and don't forget to include target variable and key "
            f"important variable for the datasets.Please ensure and return only a list of case "
            f"sesnsitive df columns. RETURN STRICTLY A RAW VALID PYTHON LIST STARTING WITH '[' "
            f"AND ENDING WITH ']'. DO NOT ADD ANY CONVERSATIONAL TEXT, EXPLANATION, OR MARKDOWN BLOCK."
        )
        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
        )
        parsed = parse_literal(response.choices[0].message.content, expect="list")
        return parsed if isinstance(parsed, list) else None
