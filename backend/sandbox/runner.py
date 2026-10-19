"""Controlled execution for generated analytical Python.

The worker runs in a separate process and receives only a dataframe copy. The
AST gate and restricted globals are defense-in-depth; this is still an
application sandbox, so production deployments should additionally use a
container or OS sandbox boundary.
"""
from __future__ import annotations

import ast
import contextlib
import io
import multiprocessing as mp
import queue
import time
import traceback
import datetime
import re
from typing import Any

import numpy as np
import pandas as pd

from backend.sandbox.policies import ALLOWED_MODULES, BLOCKED_BUILTINS, BLOCKED_MODULES, MAX_MEMORY_MB, MAX_OUTPUT_CHARS


class SandboxResult:
    def __init__(self):
        self.status = "pending"
        self.output_code = ""
        self.analysis_name = "custom_analysis"
        self.chart = None
        self.chart_type = None
        self.chart_data: dict = {}
        self.artifact = None
        self.tables: list = []
        self.statistics: dict = {}
        self.insights: list = []
        self.warnings: list = []
        self.execution_time_ms = 0
        self.error_type = None
        self.message = None
        self.retryable = False
        self.variables: dict = {}
        self.dataset_update: dict | None = None
        self.transformed_records: list | None = None

    def to_dict(self) -> dict:
        chart_obj = self.chart
        if not chart_obj and self.chart_type:
            chart_obj = {"type": self.chart_type, "data": self.chart_data, "artifact": self.artifact}
        return {
            "status": self.status,
            "analysis_name": self.analysis_name,
            "chart": chart_obj,
            "chart_type": self.chart_type or (chart_obj.get("type") if isinstance(chart_obj, dict) else None),
            "chart_data": self.chart_data or (chart_obj.get("data") if isinstance(chart_obj, dict) else {}),
            "tables": self.tables,
            "statistics": self.statistics,
            "insights": self.insights,
            "warnings": self.warnings,
            "execution_time_ms": self.execution_time_ms,
            "error_type": self.error_type,
            "message": self.message,
            "retryable": self.retryable,
            "variables": self.variables,
            "dataset_update": self.dataset_update,
            "transformed_records": self.transformed_records,
        }


def validate_code(code: str) -> str | None:
    if not isinstance(code, str) or not code.strip():
        return "Generated code is empty"
    if len(code) > 30_000:
        return "Generated code exceeds the 30,000 character limit"
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return f"Syntax error: {exc}"
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            module = (getattr(node, "module", "") or "")
            if isinstance(node, ast.Import) and node.names:
                module = node.names[0].name
            top = module.split(".")[0]
            if top in BLOCKED_MODULES or top not in ALLOWED_MODULES:
                return f"Blocked import: {module}"
        if isinstance(node, ast.Name) and (node.id.startswith("__") or node.id in BLOCKED_BUILTINS):
            return f"Blocked name: {node.id}"
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            return f"Blocked attribute: {node.attr}"
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in BLOCKED_BUILTINS:
            return f"Blocked call: {node.func.id}"
    return None


def _safe_import(name: str, *args, **kwargs):
    top = name.split(".")[0]
    if top in ALLOWED_MODULES:
        return __import__(name, *args, **kwargs)
    raise ImportError(f"Import of '{name}' is not permitted in sandbox")


def _safe_globals(df: pd.DataFrame) -> dict:
    builtin_map = __builtins__ if isinstance(__builtins__, dict) else vars(__builtins__)
    allowed_builtins = {
        name: builtin_map[name]
        for name in (
            "len", "range", "sorted", "max", "min", "sum", "abs", "round",
            "int", "float", "str", "bool", "list", "dict", "tuple", "set",
            "enumerate", "zip", "any", "all", "print", "isinstance", "type",
            "hasattr", "map", "filter", "reversed", "slice", "iter", "next",
        )
        if name in builtin_map
    }
    allowed_builtins["__import__"] = _safe_import
    return {
        "__builtins__": allowed_builtins,
        "df": df.copy(),
        "dataset": df.copy(),
        "pd": pd,
        "np": np,
        "pandas": pd,
        "numpy": np,
        "re": re,
        "datetime": datetime,
    }


def _worker(code: str, df: pd.DataFrame, output) -> None:
    result = SandboxResult()
    captured = io.StringIO()
    try:
        globals_dict = _safe_globals(df)
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            exec(compile(code, "<argus-sandbox>", "exec"), globals_dict)
        result.status = "success"
        result.output_code = captured.getvalue()[:MAX_OUTPUT_CHARS]
        value = globals_dict.get("result")
        if isinstance(value, dict):
            result.analysis_name = str(value.get("analysis_name", result.analysis_name))
            result.chart_type = value.get("chart_type")
            chart_data = value.get("chart_data")
            result.chart_data = chart_data if isinstance(chart_data, dict) else {}
            result.artifact = value.get("artifact")
            if isinstance(value.get("chart"), dict):
                result.chart = value["chart"]
            elif result.chart_type and result.chart_data:
                result.chart = {"type": result.chart_type, "data": result.chart_data, "artifact": result.artifact}
            result.statistics = value.get("statistics", {}) if isinstance(value.get("statistics", {}), dict) else {}
            result.insights = value.get("insights", []) if isinstance(value.get("insights", []), list) else [str(value.get("insights"))]
            result.tables = value.get("tables", []) if isinstance(value.get("tables", []), list) else []

        # Detect transformed, cleaned, or mutated dataframe
        candidate_df = None
        for cand in (
            value.get("df") if isinstance(value, dict) else None,
            value.get("transformed_df") if isinstance(value, dict) else None,
            value.get("dataset") if isinstance(value, dict) else None,
            globals_dict.get("df_result"),
            globals_dict.get("transformed_df"),
            globals_dict.get("df_cleaned"),
            globals_dict.get("df_transformed"),
            globals_dict.get("df"),
        ):
            if isinstance(cand, pd.DataFrame):
                # Did it change compared to the original input df?
                if (
                    cand.shape != df.shape
                    or list(cand.columns) != list(df.columns)
                    or not cand.equals(df)
                ):
                    candidate_df = cand
                    break

        if candidate_df is not None:
            new_cols = list(candidate_df.columns)
            old_cols = list(df.columns)
            result.dataset_update = {
                "transformed": True,
                "rows": int(len(candidate_df)),
                "columns": new_cols,
                "shape": list(candidate_df.shape),
                "row_delta": int(len(candidate_df) - len(df)),
                "new_columns": [c for c in new_cols if c not in old_cols],
                "dropped_columns": [c for c in old_cols if c not in new_cols],
                "preview": candidate_df.head(15).to_dict(orient="records"),
                "dtypes": {str(c): str(t) for c, t in candidate_df.dtypes.items()},
            }
            # Limit serialized records to 5,000 rows for IPC safety
            result.transformed_records = candidate_df.head(5000).to_dict(orient="records")
            final_df = candidate_df
        else:
            final_df = df

        result.variables = {"columns": list(final_df.columns)[:50], "shape": list(final_df.shape)}
        output.put(result.to_dict())
    except Exception as exc:
        result.status = "error"
        result.error_type = type(exc).__name__.lower()
        result.message = str(exc)
        result.retryable = isinstance(exc, (NameError, KeyError, ValueError))
        result.warnings = traceback.format_exc().splitlines()[-4:]
        output.put(result.to_dict())


def run_sandboxed_analysis(code: str, df: pd.DataFrame, timeout: int = 30) -> SandboxResult:
    started = time.perf_counter()
    result = SandboxResult()
    error = validate_code(code)
    if error:
        result.status = "error"
        result.error_type = "validation_error"
        result.message = error
        result.execution_time_ms = int((time.perf_counter() - started) * 1000)
        return result

    class _InlineQueue:
        def __init__(self):
            self.value = None
        def put(self, value):
            self.value = value

    limit = max(1, min(int(timeout), 60))
    process = None
    try:
        ctx = mp.get_context("spawn")
        output = ctx.Queue(maxsize=1)
        process = ctx.Process(target=_worker, args=(code, df.copy(deep=True), output), daemon=True)
        process.start()
        # Read before joining. A child that writes more than the OS pipe buffer
        # blocks in its queue feeder thread until the parent drains it, so
        # joining first would hang until the timeout and report a successful
        # analysis as a timeout.
        try:
            payload = output.get(timeout=limit)
        except queue.Empty:
            payload = None
        process.join(2)
        if payload is not None:
            for key, value in payload.items():
                if hasattr(result, key):
                    setattr(result, key, value)
        elif process.exitcode is None:
            result.status = "error"
            result.error_type = "timeout_error"
            result.message = f"Execution exceeded {timeout}s limit"
            result.retryable = True
        else:
            result.status = "error"
            result.error_type = "worker_error"
            result.message = f"Sandbox worker exited ({process.exitcode}) without a result"
    except (PermissionError, OSError):
        # Some managed Windows runtimes disallow multiprocessing primitives.
        # Keep the same AST-restricted worker as a compatibility fallback.
        inline = _InlineQueue()
        _worker(code, df.copy(deep=True), inline)
        if inline.value:
            for key, value in inline.value.items():
                if hasattr(result, key):
                    setattr(result, key, value)
        else:
            result.status = "error"
            result.error_type = "worker_error"
            result.message = "Sandbox worker returned no result"
    except Exception as exc:
        result.status = "error"
        result.error_type = type(exc).__name__.lower()
        result.message = str(exc)
        result.retryable = False
    finally:
        if process is not None:
            if process.is_alive():
                process.terminate()
                # close() raises if the process is still running, and it would
                # raise from inside finally, discarding the real result.
                process.join(2)
            with contextlib.suppress(ValueError):
                process.close()
    result.execution_time_ms = int((time.perf_counter() - started) * 1000)
    return result
