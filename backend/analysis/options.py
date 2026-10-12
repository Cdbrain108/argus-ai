"""Validated Explore options shared by every request to the analysis service."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError


class Options(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UnivariateOptions(Options):
    bins: Literal["auto"] | Annotated[StrictInt, Field(ge=5, le=80)] = "auto"
    top_n: Annotated[StrictInt, Field(ge=1, le=50)] = 20
    time_bucket: Literal["auto", "hour", "day", "week", "month", "year"] = "auto"
    text_view: Literal["length", "tokens"] = "length"


class BivariateOptions(Options):
    aggregation: Literal["auto", "mean", "median", "count", "sum"] = "auto"


class CorrelationOptions(Options):
    top_n: Annotated[StrictInt, Field(ge=1, le=100)] = 10
    method: Literal["pearson", "spearman"] = "pearson"


class MultivariateOptions(Options):
    n_clusters: Literal["auto"] | Annotated[StrictInt, Field(ge=2, le=8)] = "auto"
    target: str | None = None


def validate_options(analysis_type: str, parameters: dict) -> dict:
    model = {"univariate": UnivariateOptions, "bivariate": BivariateOptions,
             "correlation": CorrelationOptions, "multivariate": MultivariateOptions}.get(analysis_type)
    if model is None:
        return dict(parameters)
    try:
        return model.model_validate(parameters).model_dump()
    except ValidationError as exc:
        details = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors(include_input=False))
        raise ValueError(f"Invalid {analysis_type} options: {details}") from exc
