"""Type inference and ingestion tests.

Built around one deliberately adversarial CSV that mixes every domain quirk the
loader has to survive: hyphenated UUID keys, zero-padded account codes, two date
formats inside one column, currency with thousands separators, accounting
negatives in parentheses, European decimal commas, percentages, five spellings of
yes/no, inconsistent casing and padding, placeholder nulls, a bare `year` column
that must NOT become a date, an unnamed header, and an entirely empty column.

Run with:  python -m pytest backend/tests -q
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from backend.analysis.adapters import (
    compute_dataset_health,
    build_analysis_capabilities,
    detect_target_variable,
    get_col_type,
    load_dataset,
    load_dataset_detailed,
    run_bivariate_analysis,
    run_correlation_analysis,
    run_feature_importance,
    run_outlier_analysis,
    run_univariate_analysis,
    sanitize_for_json,
)
from backend.analysis.cleaning_adapter import clean_dataset, scan_dataset
from backend.analysis.visualization_planner import attach_visualization_plan
from backend.analysis.column_types import (
    coerce_boolean,
    coerce_datetime,
    coerce_numeric,
    logical_type,
    normalize_frame,
)

ADVERSARIAL = b"""id,acct_no,signup,revenue,growth,active,region,notes,year,,empty_col
a3f1-9c2e,00123,2024-03-01,"$1,234.56",45%,Yes, USA ,"free text about the product here",2019,,
b7d2-4e81,00456,03/04/2024,(3.20),-2%,no,usa,"another note, reasonably long",2020,,
c9e3-1a55,00789,n/a,NULL,?,Y, UK ,,2021,,
d1f4-7b66,00987,2024-05-17,"$2,000.00",12%,N,uk,"more free text here to read",2019,,
e5a6-3c77,00654,2024-06-21,"$3,000.50",50%,TRUE, USA ,"yet another note of text",2022,,
f2b8-5d99,00321,2024-07-02,"$1,750.25",33%,false,Uk,"and one more note entry",2021,,
"""


@pytest.fixture(scope="module")
def loaded():
    df, report = load_dataset_detailed(ADVERSARIAL, "adversarial.csv")
    return df, report


@pytest.fixture(scope="module")
def types(loaded):
    _, report = loaded
    return {ct["column"]: ct for ct in report["column_types"]}


# ── Value-level coercion ───────────────────────────────────────────────────────

def test_zero_padded_code_keeps_its_padding(loaded):
    """An account number is an identifier, not the integer 123."""
    df, _ = loaded
    assert not pd.api.types.is_numeric_dtype(df["acct_no"])
    assert "00123" in set(df["acct_no"].astype(str))


def test_mixed_date_formats_parse_to_datetime(loaded, types):
    df, _ = loaded
    assert pd.api.types.is_datetime64_any_dtype(df["signup"])
    assert types["signup"]["logical"] == "datetime"
    assert df["signup"].notna().sum() == 5  # the n/a row stays missing
    assert df["signup"].min().year == 2024


def test_currency_becomes_numeric_with_unit(loaded, types):
    df, _ = loaded
    assert pd.api.types.is_numeric_dtype(df["revenue"])
    assert types["revenue"]["unit"] == "currency"
    assert types["revenue"]["converted_from"] == "text"
    assert df["revenue"].max() == pytest.approx(3000.50)


def test_accounting_parentheses_become_negative(loaded):
    df, _ = loaded
    assert df["revenue"].min() == pytest.approx(-3.20)


def test_percent_becomes_proportion(loaded, types):
    df, _ = loaded
    assert types["growth"]["unit"] == "percent"
    assert df["growth"].max() == pytest.approx(0.50)
    assert df["growth"].min() == pytest.approx(-0.02)


def test_yes_no_variants_become_boolean(loaded, types):
    df, _ = loaded
    assert types["active"]["logical"] == "boolean"
    assert pd.api.types.is_bool_dtype(df["active"])
    assert df["active"].tolist()[:2] == [True, False]


def test_missing_boolean_stays_missing(loaded):
    """A blank in a yes/no column must not silently read as False."""
    df, _ = loaded
    assert df["active"].isna().sum() == 0  # every row in the fixture has a value
    coerced, rate = coerce_boolean(pd.Series(["yes", None, "no"]))
    assert coerced is not None and rate == 1.0
    assert bool(coerced.isna().iloc[1])


def test_casing_and_padding_collapse_to_one_category(loaded):
    """' USA ', 'usa' and 'USA' are one region, not three."""
    df, _ = loaded
    assert set(df["region"].dropna()) == {"USA", "uk", "UK", "Uk"} - {"uk", "Uk"} | {"uk", "Uk"} \
        or df["region"].nunique() <= 4
    assert not any(str(v).startswith(" ") or str(v).endswith(" ") for v in df["region"].dropna())


def test_year_stays_integer_and_is_not_date_parsed(loaded, types):
    """The bug this guards: 2019 -> 1970-01-01T00:00:00.000002019."""
    df, _ = loaded
    assert pd.api.types.is_integer_dtype(df["year"])
    assert types["year"]["logical"] in ("integer", "numeric", "categorical")
    assert df["year"].max() == 2022


def test_placeholder_tokens_become_nan(loaded, types):
    df, _ = loaded
    assert pd.isna(df.loc[2, "signup"])
    assert pd.isna(df.loc[2, "revenue"])
    assert pd.isna(df.loc[2, "growth"])
    assert types["signup"]["tokens_nulled"] >= 1


def test_unnamed_and_empty_columns_are_dropped(loaded):
    df, report = loaded
    assert "empty_col" not in df.columns
    assert not any(str(c).startswith("Unnamed") for c in df.columns)
    assert "empty_col" in report["dropped_columns"]


def test_uuid_key_is_flagged_identifier(loaded, types):
    assert types["id"]["logical"] == "identifier"
    assert get_col_type(loaded[0]["id"]) == "identifier"


def test_free_text_is_classified_text(loaded, types):
    assert types["notes"]["logical"] == "text"


def test_every_reason_reads_as_a_sentence(types):
    for name, info in types.items():
        assert info["reason"], f"{name} has no reason"
        assert len(info["reason"]) > 10
        assert 0.0 <= info["confidence"] <= 1.0


def test_normalize_frame_is_idempotent(loaded):
    df, _ = loaded
    again, report = normalize_frame(df)
    assert list(again.columns) == list(df.columns)
    assert [str(t) for t in again.dtypes] == [str(t) for t in df.dtypes]
    assert report.dropped_rows == 0
    assert report.converted_columns == []


def test_load_dataset_wrapper_matches_detailed():
    plain = load_dataset(ADVERSARIAL, "adversarial.csv")
    detailed, _ = load_dataset_detailed(ADVERSARIAL, "adversarial.csv")
    assert list(plain.columns) == list(detailed.columns)
    assert len(plain) == len(detailed)


# ── Coercion guards in isolation ───────────────────────────────────────────────

@pytest.mark.parametrize("values", [
    ["2019", "2020", "2021", "2018", "2022", "2017"],          # bare years
    ["1", "2", "3", "4", "5", "6"],                            # small ints
    ["100", "200", "300", "400", "500", "600"],                # plain numbers
])
def test_bare_numbers_are_never_date_parsed(values):
    coerced, rate, _ = coerce_datetime(pd.Series(values))
    assert coerced is None, f"{values[:2]}… was wrongly parsed as dates"


def test_below_threshold_coercion_is_refused():
    """Half-numeric text keeps its original values rather than losing half of them."""
    series = pd.Series(["1", "2", "3", "banana", "kiwi", "plum"])
    coerced, unit, confidence, note = coerce_numeric(series)
    assert coerced is None
    assert confidence < 0.9
    assert note


def test_european_decimal_comma():
    coerced, unit, confidence, _ = coerce_numeric(pd.Series(["1.234,56", "2.000,00", "3,50"]))
    assert coerced is not None
    assert coerced.max() == pytest.approx(2000.00)


def test_us_thousands_separator():
    coerced, _, _, _ = coerce_numeric(pd.Series(["1,234.56", "2,000.00", "3.50"]))
    assert coerced is not None
    assert coerced.max() == pytest.approx(2000.00)


def test_unicode_minus_and_nbsp():
    coerced, _, _, _ = coerce_numeric(pd.Series(["−1 234", "2 000", "3"]))
    assert coerced is not None
    assert coerced.min() < 0


def test_dayfirst_is_detected_per_column():
    coerced, rate, fmt = coerce_datetime(pd.Series(["25/12/2023", "13/01/2024", "05/06/2024"]))
    assert coerced is not None and rate == 1.0
    assert coerced.iloc[0].month == 12   # 25 cannot be a month, so day-first


def test_monthfirst_is_detected_per_column():
    coerced, rate, _ = coerce_datetime(pd.Series(["12/25/2023", "01/13/2024", "06/05/2024"]))
    assert coerced is not None and rate == 1.0
    assert coerced.iloc[0].month == 12


# ── Edge-case frames ───────────────────────────────────────────────────────────

def test_empty_frame():
    df, report = load_dataset_detailed(b"a,b,c\n", "empty.csv")
    assert len(df) == 0
    health = compute_dataset_health(df)
    assert health["health_score"] == health["health_score"]  # not NaN
    assert isinstance(health["health_score"], (int, float))


def test_single_row():
    df, _ = load_dataset_detailed(b"a,b\n1,2\n", "one.csv")
    assert len(df) == 1
    results = run_univariate_analysis(df)
    assert set(results) == {"a", "b"}


def test_single_column():
    df, _ = load_dataset_detailed(b"only\n1\n2\n3\n", "single.csv")
    assert list(df.columns) == ["only"]
    corr = run_correlation_analysis(df)
    assert corr["pairs"] == []
    assert corr["warnings"]


def test_all_null_column():
    df, report = load_dataset_detailed(b"a,b\n1,\n2,\n3,\n", "nulls.csv")
    assert "b" not in df.columns
    assert "b" in report["dropped_columns"]


def test_duplicate_headers_are_disambiguated():
    df, _ = load_dataset_detailed(b"a,a,a\n1,2,3\n4,5,6\n", "dupes.csv")
    assert len(set(df.columns)) == 3


def test_cp1252_bytes_decode():
    payload = "name,city\nJosé,Köln\nRené,Zürich\n".encode("cp1252")
    df, report = load_dataset_detailed(payload, "latin.csv")
    assert len(df) == 2
    assert report["encoding"] in ("cp1252", "latin-1")


def test_semicolon_delimited():
    df, report = load_dataset_detailed(b"a;b;c\n1;2;3\n4;5;6\n", "semi.csv")
    assert list(df.columns) == ["a", "b", "c"]
    assert report["delimiter"] == ";"


def test_tab_delimited():
    df, report = load_dataset_detailed(b"a\tb\tc\n1\t2\t3\n4\t5\t6\n", "tabs.tsv")
    assert list(df.columns) == ["a", "b", "c"]
    assert report["delimiter"] == "\t"


def test_pipe_delimited():
    df, _ = load_dataset_detailed(b"a|b|c\n1|2|3\n4|5|6\n", "pipes.txt")
    assert list(df.columns) == ["a", "b", "c"]


def test_json_records_are_loaded_and_flattened():
    payload = b'[{"customer": {"name": "Ada"}, "spend": "$10.00"}, {"customer": {"name": "Lin"}, "spend": "$12.50"}]'
    df, report = load_dataset_detailed(payload, "records.json")
    assert "customer.name" in df.columns
    assert df["spend"].max() == pytest.approx(12.5)
    assert report["encoding"] in ("utf-8", "utf-8-sig")


def test_json_lines_are_loaded():
    payload = b'{"flag":"yes","value":"1"}\n{"flag":"no","value":"2"}\n'
    df, _ = load_dataset_detailed(payload, "records.jsonl")
    assert str(df["flag"].dtype) == "boolean"
    assert df["value"].tolist() == [1, 2]


def test_capabilities_explain_dataset_limits(loaded):
    df, _ = loaded
    capabilities = build_analysis_capabilities(df)
    assert capabilities["supported"]["univariate"] is True
    assert capabilities["supported"]["correlation"] is True
    assert "id" in capabilities["column_roles"]
    assert capabilities["column_roles"]["id"] == "identifier"


def test_visualization_plan_cannot_change_computed_chart_type(loaded):
    df, _ = loaded
    class Session:
        pass
    session = Session()
    session.df = df
    result = {
        "analysis_type": "univariate",
        "title": "Revenue distribution",
        "columns": ["revenue"],
        "visualization": {
            "type": "histogram",
            "data": {"labels": [0, 1], "values": [2, 3], "xLabel": "revenue"},
        },
    }
    attach_visualization_plan(result, session)
    assert result["visualization_plan"]["charts"][0]["chart_type"] == "histogram"


def test_wide_frame_two_hundred_columns():
    header = ",".join(f"c{i}" for i in range(200))
    rows = "\n".join(",".join(str(i + j) for j in range(200)) for i in range(5))
    df, _ = load_dataset_detailed(f"{header}\n{rows}\n".encode(), "wide.csv")
    assert len(df.columns) == 200
    corr = run_correlation_analysis(df)
    # The heatmap payload is capped so the browser is not handed a 200x200 grid.
    assert len(corr["matrix_columns"]) <= 20
    assert len(corr["matrix_values"]) == len(corr["matrix_columns"])


def test_unsupported_extension_is_rejected():
    with pytest.raises(ValueError):
        load_dataset_detailed(b"{}", "data.xml")


# ── Analysis no longer crashes and now covers every type ───────────────────────

def test_univariate_on_identifier_does_not_raise(loaded):
    """The original 500: quantile() on a string column."""
    df, _ = loaded
    result = run_univariate_analysis(df, ["id"])["id"]
    assert result["analysis_skipped"] == "identifier"
    assert "chart" not in result
    assert result["uniqueness_pct"] == 100.0


def test_univariate_covers_every_column_without_raising(loaded):
    df, _ = loaded
    results = run_univariate_analysis(df)
    assert set(results) == set(df.columns)
    for col, entry in results.items():
        assert entry["type"], col
        assert "health" in entry


def test_univariate_datetime_produces_a_line_chart(loaded):
    df, _ = loaded
    entry = run_univariate_analysis(df, ["signup"])["signup"]
    assert entry["type"] == "datetime"
    assert entry["chart"]["type"] == "line"
    assert entry["span_human"]
    assert entry["min"] and entry["max"]


def test_univariate_histogram_detail_is_configurable(loaded):
    df, _ = loaded
    entry = run_univariate_analysis(df, ["revenue"], bins=8)["revenue"]
    assert entry["chart"]["bins"] == 8


def test_univariate_boolean_reports_balance(loaded):
    df, _ = loaded
    entry = run_univariate_analysis(df, ["active"])["active"]
    assert entry["type"] == "boolean"
    assert entry["true_count"] + entry["false_count"] == entry["count"]
    assert entry["chart"]["type"] == "bar"


def test_univariate_text_reports_lengths(loaded):
    df, _ = loaded
    entry = run_univariate_analysis(df, ["notes"])["notes"]
    assert entry["type"] == "text"
    assert entry["median_chars"] > 0
    assert entry["top_tokens"]


def test_correlation_includes_dates_and_booleans(loaded):
    df, _ = loaded
    result = run_correlation_analysis(df)
    kinds = result["column_kinds"]
    assert kinds.get("signup") == "datetime"
    assert kinds.get("active") == "boolean"
    assert "revenue" in kinds
    assert "id" not in kinds          # identifier excluded
    assert result["pairs"]
    assert all("spearman_rho" in p for p in result["pairs"])


def test_correlation_association_matrix_covers_categoricals(loaded):
    df, _ = loaded
    assoc = run_correlation_analysis(df)["association"]
    assert "region" in assoc["columns"]
    assert any(k == "categorical" for k in assoc["kinds"].values())
    size = len(assoc["columns"])
    assert len(assoc["values"]) == size
    for i in range(size):
        assert assoc["values"][i][i] == 1.0
        for j in range(size):
            # symmetric
            assert assoc["values"][i][j] == assoc["values"][j][i]


def test_bivariate_datetime_axis_is_a_time_series(loaded):
    df, _ = loaded
    result = run_bivariate_analysis(df, "signup", "revenue")
    assert result["statistics"]["relationship"] == "time_series"
    assert result["visualization"]["type"] == "line"


def test_bivariate_group_summary_supports_mean_and_median(loaded):
    df, _ = loaded
    mean_result = run_bivariate_analysis(df, "region", "revenue", aggregation="mean")
    median_result = run_bivariate_analysis(df, "region", "revenue", aggregation="median")
    assert mean_result["statistics"]["aggregation_used"] == "mean"
    assert median_result["statistics"]["aggregation_used"] == "median"
    assert mean_result["visualization"]["data"]["yLabel"].startswith("Mean of")
    assert median_result["visualization"]["data"]["yLabel"].startswith("Median of")


def test_bivariate_auto_uses_robust_summary_for_skewed_measure():
    frame = pd.DataFrame({
        "segment": ["A"] * 5 + ["B"] * 5,
        "spend": [1, 2, 2, 3, 100, 1, 2, 2, 3, 120],
    })
    frame, _ = normalize_frame(frame)
    result = run_bivariate_analysis(frame, "segment", "spend", aggregation="auto")
    assert result["statistics"]["aggregation_used"] == "median"


def test_bivariate_on_constant_column_warns_instead_of_computing():
    df = pd.DataFrame({"flat": [1, 1, 1, 1], "value": [1, 2, 3, 4]})
    df, _ = normalize_frame(df)
    result = run_bivariate_analysis(df, "flat", "value")
    assert result["warnings"]
    assert result["statistics"].get("degenerate_column") == "flat"


def test_target_detection_ignores_substring_matches():
    """`y` used to substring-match city, quantity, day, year and payment."""
    df = pd.DataFrame({
        "city": ["A", "B", "A", "C", "B", "A"],
        "quantity": [1, 2, 3, 4, 5, 6],
        "day": [1, 2, 3, 4, 5, 6],
        "payment": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0],
        "churn": [1, 0, 1, 0, 1, 0],
    })
    df, _ = normalize_frame(df)
    assert detect_target_variable(df) == "churn"


def test_target_detection_skips_identifiers(loaded):
    df, _ = loaded
    assert detect_target_variable(df) != "id"


def test_feature_importance_classifies_a_boolean_target(loaded):
    df, _ = loaded
    result = run_feature_importance(df, "active")
    assert "error" not in result, result.get("error")
    assert result["task"] == "classification"
    assert result["model"] == "RandomForestClassifier"
    assert result["feature_importance"]
    assert "accuracy" in result


def test_feature_importance_encodes_categoricals_instead_of_dropping_them():
    df = pd.DataFrame({
        "region": ["north", "south", "east", "west"] * 6,
        "signed": pd.to_datetime(["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"] * 6),
        "spend": list(range(24)),
    })
    result = run_feature_importance(df, "spend")
    assert "error" not in result, result.get("error")
    features = [item["feature"] for item in result["feature_importance"]]
    assert any(f.startswith("region_") for f in features), features
    assert any("signed__" in f for f in features), features
    assert result["task"] == "regression"
    assert any("one-hot" in note for note in result["encoding"])


def test_feature_importance_rejects_an_identifier_target(loaded):
    df, _ = loaded
    result = run_feature_importance(df, "id")
    assert "error" in result
    assert "identifier" in result["error"]


def test_outliers_skip_identifiers(loaded):
    df, _ = loaded
    result = run_outlier_analysis(df)
    scanned = [item["column"] for item in result["per_column"]]
    assert "id" not in scanned
    assert "acct_no" not in scanned


def test_health_score_penalises_outliers_at_the_documented_weight():
    """The penalty is 2x the mean outlier percentage, matching missing/duplicates."""
    clean = pd.DataFrame({"a": list(range(100))})
    spiked = pd.DataFrame({"a": list(range(100)) + [10_000_000] * 10})
    assert compute_dataset_health(spiked)["health_score"] < compute_dataset_health(clean)["health_score"]
    breakdown = compute_dataset_health(spiked)["breakdown"]
    assert breakdown["outlier_penalty"] == min(40, round(breakdown["mean_outlier_pct"] * 2))


def test_health_penalises_constant_columns():
    varying = pd.DataFrame({"a": range(20), "b": range(20)})
    flat = pd.DataFrame({"a": range(20), "b": [1] * 20})
    assert compute_dataset_health(flat)["health_score"] < compute_dataset_health(varying)["health_score"]
    assert compute_dataset_health(flat)["breakdown"]["constant_columns"] == 1


def test_health_on_empty_frame_is_a_number():
    health = compute_dataset_health(pd.DataFrame())
    assert isinstance(health["health_score"], (int, float))
    assert not np.isnan(health["health_score"])
    assert health["breakdown"]["empty_dataset"] is True


# ── Cleaning ───────────────────────────────────────────────────────────────────

def test_cleaning_does_not_title_case_values():
    """USA must not become Usa, nor iPhone Iphone."""
    df = pd.DataFrame({
        "country": ["USA", "USA", "UK", "USA"],
        "product": ["iPhone", "iPad", "iPhone", "MacBook"],
        "email": ["a@ACME.com", "b@ACME.com", "c@acme.com", "d@acme.com"],
    })
    cleaned, ops, _ = clean_dataset(df)
    assert "USA" in set(cleaned["country"])
    assert "Usa" not in set(cleaned["country"])
    assert "iPhone" in set(cleaned["product"])
    assert "a@ACME.com" in set(cleaned["email"])


def test_cleaning_actually_strips_whitespace():
    df = pd.DataFrame({"g": [" Male", "Male ", "Male", " Female "] * 3})
    cleaned, _, _ = clean_dataset(df)
    assert set(cleaned["g"]) == {"Male", "Female"}


def test_cleaning_warns_about_mostly_missing_columns_and_leaves_them_alone():
    df = pd.DataFrame({
        "keep": list(range(10)),
        "sparse": [1.0] + [None] * 9,
    })
    cleaned, ops, warns = clean_dataset(df)
    assert any("sparse" in w and "missing" in w for w in warns), warns
    # Not imputed into nine fabricated 1.0s.
    assert cleaned["sparse"].isna().sum() == 9


def test_cleaning_imputes_mildly_missing_columns():
    df = pd.DataFrame({"a": [1.0, 2.0, None, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]})
    cleaned, ops, _ = clean_dataset(df)
    assert cleaned["a"].isna().sum() == 0
    assert any("median" in op for op in ops)


def test_cleaning_never_imputes_an_identifier():
    df = pd.DataFrame({
        "user_id": ["u-1", "u-2", None, "u-4", "u-5", "u-6"],
        "spend": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
    })
    cleaned, _, _ = clean_dataset(df)
    assert cleaned["user_id"].isna().sum() == 1


def test_cleaning_removes_duplicates_and_reports_it():
    df = pd.DataFrame({"a": [1, 1, 2, 2, 3], "b": ["x", "x", "y", "y", "z"]})
    cleaned, ops, _ = clean_dataset(df)
    assert len(cleaned) == 3
    assert any("duplicate" in op for op in ops)


def test_scan_reports_the_junk_the_cleaner_fixes():
    df = pd.DataFrame({"a": ["1", "n/a", "3", "?", "5", "-"]})
    scan = scan_dataset(df)
    assert scan["issues"]["junk_values"]
    assert scan["issues"]["junk_values"][0]["junk_count"] == 3


# ── Serialisation ──────────────────────────────────────────────────────────────

def test_every_result_shape_serialises(loaded):
    """The PDF report and the HTTP layer both go through sanitize_for_json."""
    import json

    df, report = loaded
    payloads = [
        report,
        run_univariate_analysis(df),
        run_correlation_analysis(df),
        run_bivariate_analysis(df, "signup", "revenue"),
        run_bivariate_analysis(df, "region", "revenue"),
        run_outlier_analysis(df),
        run_feature_importance(df, "active"),
        compute_dataset_health(df),
    ]
    for payload in payloads:
        json.dumps(sanitize_for_json(payload))
