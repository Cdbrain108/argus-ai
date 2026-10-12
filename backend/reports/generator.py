from __future__ import annotations


SECTIONS = [
    "executive_summary",
    "dataset_information",
    "dataset_health",
    "data_cleaning",
    "univariate",
    "bivariate",
    "multivariate",
    "correlation",
    "feature_discovery",
    "outliers",
    "key_insights",
    "limitations",
    "methodology",
]


def build_report_payload(dataset_id: str | None) -> dict:
    data: dict = {"dataset_id": dataset_id, "sections": SECTIONS}
    if not dataset_id:
        return data
    try:
        from backend.services import dataset_service as ds
        from backend.analysis.adapters import (
            compute_dataset_health,
            run_eda,
            run_univariate_analysis,
            run_correlation_analysis,
            run_feature_importance,
            detect_target_variable,
            sanitize_for_json,
        )
        from backend.analysis.cleaning_adapter import scan_dataset
        session = ds.get_dataset(dataset_id)
        if session is None:
            return data
        df = session.cleaned_df if session.cleaned_df is not None else session.df
        data["eda"] = run_eda(df)
        data["health"] = compute_dataset_health(df)
        data["cleaning_scan"] = scan_dataset(session.df)
        data["univariate"] = run_univariate_analysis(df, list(df.columns[:10]))
        data["correlation"] = run_correlation_analysis(df, top_n=10)
        target = detect_target_variable(df)
        if target:
            data["feature_discovery"] = run_feature_importance(df, target)
        else:
            data["feature_discovery"] = {
                "error": "No suitable prediction target was detected in this dataset."
            }
        data["history"] = session.analysis_history
    except Exception as exc:
        data["error"] = str(exc)
    try:
        from backend.analysis.adapters import sanitize_for_json as _san
        return _san(data)
    except Exception:
        return data
