"""End-to-end option propagation and data-conservation checks for Explore."""
import json

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from threadpoolctl import threadpool_limits

from backend.analysis.adapters import (
    _as_float, run_univariate_analysis,
    run_bivariate_analysis, run_correlation_analysis, run_multivariate_analysis,
)
from backend.api.analysis import router
from backend.services import dataset_service


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setenv("ARGUS_CHART_AI", "off")
    monkeypatch.setenv("ARGUS_NARRATION", "off")
    with threadpool_limits(limits=1):
        yield


@pytest.fixture
def api_dataset():
    x = np.arange(1, 61, dtype=float)
    df = pd.DataFrame({"age": x, "expense": x ** 3, "segment": ["north", "south", "west"] * 20})
    session = dataset_service.create_dataset_session(df.to_csv(index=False).encode(), "measurements.csv")
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        yield client, session
    dataset_service._DATASETS.pop(session.dataset_id, None)


def test_unique_numeric_csv_measurements_are_not_mistaken_for_ids(api_dataset):
    _, session = api_dataset
    assert pd.api.types.is_numeric_dtype(session.df.age)
    assert session.column_types["expense"]["logical"] in {"numeric", "integer"}


def test_all_column_histograms_preserve_every_bin_and_observation(api_dataset):
    client, session = api_dataset
    response = client.post("/api/analysis/run", json={
        "dataset_id": session.dataset_id, "analysis_type": "univariate",
        "parameters": {"bins": 50, "top_n": 2},
    })
    assert response.status_code == 200, response.text
    result = response.json()
    for chart in result["visualization"]["charts"]:
        if chart["type"] == "histogram":
            assert len(chart["values"]) == len(chart["labels"]) == 50
            assert len(chart["edges"]) == 51
            assert sum(chart["values"]) == 60  # old multi-chart truncation lost bins
        else:
            assert len(chart["labels"]) == 2
            assert sum(chart["values"]) == 40
    json.dumps(result, allow_nan=False)


def test_auto_bins_respond_to_distribution_not_only_cardinality():
    evenly_spread = pd.DataFrame({"measure": np.linspace(0, 1, 100)})
    long_tail = pd.DataFrame({"measure": np.geomspace(1, 100000, 100)})
    first = run_univariate_analysis(evenly_spread)["measure"]["chart"]
    second = run_univariate_analysis(long_tail)["measure"]["chart"]
    assert len(first["values"]) != len(second["values"])
    assert sum(first["values"]) == sum(second["values"]) == 100


def test_date_buckets_change_values_and_conserve_count():
    df = pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-02-01", "2024-02-02"])})
    daily = run_univariate_analysis(df, time_bucket="day")["date"]["chart"]
    monthly = run_univariate_analysis(df, time_bucket="month")["date"]["chart"]
    assert daily["values"] == [1, 1, 1, 1]
    assert monthly["values"] == [2, 2]
    assert monthly["labels"] == ["2024-01", "2024-02"]


def test_text_view_changes_chart_without_changing_statistics():
    df = pd.DataFrame({"notes": ["pleasant service and very helpful staff", "pleasant service but a long wait", "very helpful staff at the counter"]})
    lengths = run_univariate_analysis(df, text_view="length")["notes"]
    tokens = run_univariate_analysis(df, text_view="tokens")["notes"]
    assert lengths["chart"]["type"] == "histogram"
    assert tokens["chart"]["type"] == "bar"
    assert tokens["mean_chars"] == lengths["mean_chars"]
    assert dict(zip(tokens["chart"]["labels"], tokens["chart"]["values"]))["service"] == 2


@pytest.mark.parametrize("reverse", [False, True])
def test_age_by_sex_median_is_exact_with_small_numeric_samples(reverse):
    df = pd.DataFrame({"age": [20, 22, 90, 30, 32, 34], "sex": ["F"] * 3 + ["M"] * 3})
    columns = ["sex", "age"] if reverse else ["age", "sex"]
    median = run_bivariate_analysis(df, *columns, aggregation="median")
    mean = run_bivariate_analysis(df, *columns, aggregation="mean")
    assert median["statistics"]["group_values"] == {"M": 32, "F": 22}
    assert mean["statistics"]["group_values"]["F"] == 44
    assert median["statistics"]["group_counts"] == {"M": 3, "F": 3}


def test_numeric_pairs_stay_scatter_even_with_few_distinct_values():
    result = run_bivariate_analysis(pd.DataFrame({"age": [20, 30, 40], "weight": [50, 60, 80]}), "age", "weight", aggregation="median")
    assert result["visualization"]["type"] == "scatter"
    assert result["visualization"]["data"]["x"] == [20, 30, 40]


def test_categorical_pairs_plot_joint_not_marginal_counts():
    df = pd.DataFrame({"region": ["north", "north", "north", "south"], "outcome": ["won", "won", "lost", "lost"]})
    result = run_bivariate_analysis(df, "region", "outcome")
    chart = result["visualization"]["data"]
    assert sorted(chart["values"]) == [1, 1, 2]
    assert sum(chart["values"]) == 4
    assert all(" / " in label for label in chart["labels"])


def test_correlation_method_updates_matrix_and_ranking(api_dataset):
    client, session = api_dataset
    responses = []
    for method in ("pearson", "spearman"):
        response = client.post("/api/analysis/run", json={
            "dataset_id": session.dataset_id, "analysis_type": "correlation",
            "parameters": {"method": method, "top_n": 1},
        })
        assert response.status_code == 200, response.text
        responses.append(response.json()["statistics"])
    pearson, spearman = responses
    assert len(spearman["pairs"]) == 1
    assert spearman["matrix"]["age"]["expense"] == 1
    assert pearson["matrix"]["age"]["expense"] < .95
    assert spearman["pairs"][0]["sample_size"] == 60
    assert spearman["method"] == "spearman"


def test_insufficient_pairwise_overlap_is_not_zero_correlation():
    df = pd.DataFrame({"a": [1, 2, 3, None, None], "b": [None, None, 1, 2, 3]})
    result = run_correlation_analysis(df)
    assert result["matrix"]["a"]["b"] is None
    assert result["pairs"] == []


def test_epoch_conversion_accounts_for_pandas_datetime_resolution():
    dates = pd.Series(pd.to_datetime(["2024-01-01", "2024-01-02"]))
    values = _as_float(dates)
    assert values.iloc[1] - values.iloc[0] == 86400


def test_multivariate_clusters_adapt_and_include_medians():
    rng = np.random.default_rng(42)
    values = np.vstack([rng.normal(-8, .05, (20, 2)), rng.normal(8, .05, (20, 2))])
    df = pd.DataFrame(values, columns=["length", "width"])
    result = run_multivariate_analysis(df, n_clusters="auto")
    clusters = result["pca_clusters"]
    assert clusters["n_clusters"] == 2
    assert sum(clusters["cluster_sizes"].values()) == 40
    for profile in clusters["cluster_profiles"]:
        mask = np.array(clusters["cluster_labels"]) == profile["cluster_id"]
        assert profile["feature_medians"]["length"] == round(df.loc[mask, "length"].median(), 2)
    assert "silhouette" in clusters["selection_reason"]


def test_cluster_count_never_exceeds_distinct_records():
    df = pd.DataFrame({"a": [2, 2, 2, 4, 4, 4], "b": [8, 8, 8, 9, 9, 9]})
    result = run_multivariate_analysis(df, n_clusters=8)["pca_clusters"]
    assert result["n_clusters"] == 2
    assert all(p["count"] > 0 for p in result["cluster_profiles"])


def test_multivariate_options_reach_tool_and_exclude_target(api_dataset):
    client, session = api_dataset
    response = client.post("/api/analysis/run", json={
        "dataset_id": session.dataset_id, "analysis_type": "multivariate", "columns": ["expense"],
        "parameters": {"n_clusters": 4},
    })
    assert response.status_code == 200, response.text
    stats = response.json()["statistics"]
    assert stats["target"] == "expense"
    assert stats["pca_clusters"]["n_clusters"] == 4
    assert "expense" not in stats["pca_clusters"]["features_used"]
    assert any(c.startswith("segment_") for c in stats["pca_clusters"]["features_used"])


@pytest.mark.parametrize("analysis, parameters", [
    ("univariate", {"bins": 500}), ("univariate", {"time_bucket": "invalid"}),
    ("correlation", {"method": "made-up"}), ("multivariate", {"n_clusters": True}),
    ("multivariate", {"n_clusters": 0}), ("univariate", {"arbitrary_code": "ignore"}),
])
def test_bad_options_return_actionable_400(api_dataset, analysis, parameters):
    client, session = api_dataset
    response = client.post("/api/analysis/run", json={
        "dataset_id": session.dataset_id, "analysis_type": analysis, "parameters": parameters,
    })
    assert response.status_code == 400
    assert "Invalid" in response.json()["detail"]


def test_duplicate_pair_selection_is_rejected(api_dataset):
    client, session = api_dataset
    response = client.post("/api/analysis/run", json={
        "dataset_id": session.dataset_id, "analysis_type": "bivariate", "columns": ["age", "age"],
    })
    assert response.status_code == 400
    assert "different" in response.json()["detail"]
