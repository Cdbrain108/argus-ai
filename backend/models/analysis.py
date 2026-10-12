"""
Analysis result schemas — used by every tool and endpoint.
Contract defined in spec section 27.
"""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AnalysisType(str, Enum):
    OVERVIEW = "overview"
    HEALTH = "health"
    CLEANING = "cleaning"
    UNIVARIATE = "univariate"
    BIVARIATE = "bivariate"
    MULTIVARIATE = "multivariate"
    CORRELATION = "correlation"
    FEATURE_IMPORTANCE = "feature_importance"
    FEATURE_DISCOVERY = "feature_discovery"
    CUSTOM = "custom"


class VisualizationType(str, Enum):
    SCATTER = "scatter"
    BAR = "bar"
    HISTOGRAM = "histogram"
    HEATMAP = "heatmap"
    BOX = "box"
    LINE = "line"
    GAUGE = "gauge"
    TABLE = "table"
    CUSTOM = "custom"


class Visualization(BaseModel):
    type: VisualizationType
    artifact_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None  # serialized chart data for frontend rendering


class AnalysisResult(BaseModel):
    analysis_id: str
    analysis_type: AnalysisType
    title: str
    columns: List[str] = Field(default_factory=list)
    visualization: Optional[Visualization] = None
    statistics: Dict[str, Any] = Field(default_factory=dict)
    insights: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    methodology: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ChatRequest(BaseModel):
    session_id: str
    dataset_id: Optional[str] = None
    message: str
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    session_id: str
    message: str
    analysis_id: Optional[str] = None
    status_steps: List[str] = Field(default_factory=list)


class DatasetUploadResponse(BaseModel):
    dataset_id: str
    filename: str
    rows: int
    columns: int
    column_names: List[str]
    dtypes: Dict[str, str]
    missing_total: int


class HealthResponse(BaseModel):
    dataset_id: str
    health_score: float
    missing_penalty: float
    duplicate_penalty: float
    outlier_penalty: float
    breakdown: Dict[str, Any]


class CleaningRequest(BaseModel):
    dataset_id: str


class CleaningResult(BaseModel):
    dataset_id: str
    health_before: float
    health_after: float
    issues: List[str]
    operations: List[str]
    cleaned_preview: Dict[str, Any]


class AnalysisRunRequest(BaseModel):
    dataset_id: str
    analysis_type: str
    columns: Optional[List[str]] = None
    parameters: Optional[Dict[str, Any]] = None


class ReportGenerateRequest(BaseModel):
    dataset_id: Optional[str] = None
    session_id: Optional[str] = None


class ReportResponse(BaseModel):
    report_id: str
    dataset_id: Optional[str]
    created_at: str
    sections: List[str]
    pdf_path: Optional[str] = None
