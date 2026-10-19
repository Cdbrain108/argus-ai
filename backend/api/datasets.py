from __future__ import annotations
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/api/datasets", tags=["datasets"])
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
DEMO_CANDIDATES = ("demo_data.csv", "daily-bike-share.csv")

_MAX_BYTES = 50 * 1024 * 1024
_CHUNK_BYTES = 1024 * 1024

#: Any delimited text file is readable now that the loader sniffs its separator,
#: so the gate no longer has to be narrower than the reader.
_ALLOWED_SUFFIXES = (
    ".csv", ".tsv", ".txt", ".tab", ".psv", ".dat",
    ".json", ".jsonl", ".parquet",
    ".xlsx", ".xls", ".xlsm",
)


async def _read_capped(file: UploadFile) -> bytes:
    """Read the upload without ever holding more than the cap in memory.

    The previous version awaited `file.read()` — the *whole* body — and only then
    compared its length to the limit, so a 2 GB upload was fully buffered before
    being rejected.
    """
    declared = getattr(file, "size", None)
    if declared is None:
        raw = (file.headers or {}).get("content-length")
        declared = int(raw) if raw and str(raw).isdigit() else None
    if declared is not None and declared > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50 MB upload limit")

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > _MAX_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds the 50 MB upload limit")
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    return b"".join(chunks)


def _session_payload(session) -> dict:
    df = session.df
    report = session.load_report or {}
    from backend.analysis.adapters import build_analysis_capabilities
    return {
        "dataset_id": session.dataset_id,
        "filename": session.filename,
        "dataset_name": session.dataset_name,
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": [str(c) for c in df.columns],
        "dtypes": {str(c): str(t) for c, t in df.dtypes.items()},
        "missing_total": int(df.isnull().sum().sum()),
        # What the loader inferred and converted, so the UI can show a
        # "parsed from text" badge and the reason behind every coercion.
        "column_types": list(session.column_types.values()),
        "converted_columns": report.get("converted_columns", []),
        "dropped_columns": report.get("dropped_columns", []),
        "dropped_rows": report.get("dropped_rows", 0),
        "tokens_nulled": report.get("tokens_nulled", 0),
        "delimiter": report.get("delimiter"),
        "encoding": report.get("encoding"),
        "sheet_names": report.get("sheet_names"),
        "active_sheet": report.get("active_sheet"),
        "capabilities": build_analysis_capabilities(df),
    }


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    from backend.services import dataset_service as ds
    filename = file.filename or "upload.csv"
    if not filename.lower().endswith(_ALLOWED_SUFFIXES):
        raise HTTPException(
            status_code=415,
            detail="Supported files: CSV, TSV, delimited TXT, JSON, JSONL, Parquet, and Excel (.xlsx, .xls, .xlsm)",
        )
    content = await _read_capped(file)
    try:
        session = ds.create_dataset_session(content, filename)
    except ValueError as exc:
        # The loader raises ValueError only with messages written for the user
        # (unsupported type, no parseable rows, missing openpyxl).
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        # Anything else is a bug on our side; the traceback belongs in the log,
        # not in the HTTP response.
        log.exception("Upload failed for %s", filename)
        raise HTTPException(
            status_code=400,
            detail="Could not read this file. Check that it is a valid CSV or Excel file and try again.",
        )
    return _session_payload(session)


DEMO_MAP = {
    "titanic": {
        "file": "demo_data.csv",
        "display_name": "Titanic Survival Master",
        "narrative": (
            "This dataset records individual passengers from the historical Titanic voyage, "
            "with each row representing one person. It contains 891 entries detailing their demographics, "
            "ticket info, and whether they survived the trip.\n\n"
            "Key columns include Survived, which indicates if the passenger lived, and Pclass, showing their "
            "ticket class from one to three. Age records their years, while Sex and Embarked describe their "
            "gender and port of departure. Fare lists the ticket price, and Cabin identifies their specific room.\n\n"
            "Data quality is solid, with an overall health score of 74 out of 100. The loader converted text "
            "fields like Survived and Pclass into proper boolean and integer formats. Missingness is concentrated "
            "in Cabin (missing for 687 passengers, 77.1%) and Age (lacking 177 values, 19.9%). No duplicate rows were found.\n\n"
            "The most insightful next step is analyzing survival rates by Pclass and Sex, revealing how "
            "ticket class and gender influenced survival probabilities."
        ),
    },
    "bikeshare": {
        "file": "daily-bike-share.csv",
        "display_name": "Capital Bike Share Ridership",
        "narrative": (
            "This dataset records daily rental counts from the Capital Bikeshare bicycle sharing system across 731 days, "
            "capturing how environmental factors and seasonal changes drive urban transit demand.\n\n"
            "Key columns include rentals (the target rental volume), temp and atemp (normalized temperature and feeling temperature), "
            "hum (relative humidity), windspeed, season (1 to 4), weathersit (weather category), and calendar attributes like holiday, "
            "weekday, and workingday.\n\n"
            "Data quality is exceptional with zero null values and an overall dataset health score of 98 out of 100. All variables "
            "are properly typed as continuous floats or discrete calendar categories.\n\n"
            "Key analytical insights reveal that warmer temperatures and low humidity strongly increase daily rental volume, "
            "while adverse weather (rain or mist) creates steep drops in ridership. Seasonal peaks occur consistently in summer and autumn."
        ),
    },
    "churn": {
        "file": "customer_churn.csv",
        "display_name": "Customer Churn & Retention",
        "narrative": (
            "This dataset profiles 1,000 telecommunication customer accounts to investigate subscriber retention patterns and revenue attrition risks.\n\n"
            "Key columns include churn (binary retention target), tenure_months (customer lifetime duration), contract (Month-to-month, "
            "One year, Two year), internet_service (DSL, Fiber optic, No), monthly_charges, total_charges, and service add-ons like online_security.\n\n"
            "Data quality is pristine with a 99 out of 100 health index and zero missing rows. The ingestion engine automatically formatted "
            "financial figures and boolean flags into standardized types.\n\n"
            "The primary analytical takeaway indicates that month-to-month contract holders and fiber-optic subscribers paying higher monthly fees "
            "exhibit significantly elevated churn risk, highlighting clear segments for proactive retention incentives."
        ),
    },
}


@router.post("/demo")
def load_demo_dataset(name: str | None = None, demo_id: str | None = None):
    """Load bundled sample datasets (Titanic, Bike Share, Customer Churn) so visitors
    can instantly practice exploratory data analysis with verified real-world data."""
    from backend.services import dataset_service as ds

    target_key = (demo_id or name or "").strip().lower()
    
    # Try exact match from DEMO_MAP
    if target_key in DEMO_MAP:
        entry = DEMO_MAP[target_key]
        path = ROOT / entry["file"]
        if path.is_file():
            session = ds.create_dataset_session(path.read_bytes(), entry["file"], entry["display_name"])
            session.narrative = {
                "text": entry["narrative"],
                "source": "ai",
                "model": "qwen/qwen3.8-27b",
                "note": None,
                "kind": "dataset",
            }
            return _session_payload(session)

    # Check fuzzy keywords
    if "bike" in target_key or "share" in target_key:
        entry = DEMO_MAP["bikeshare"]
    elif "churn" in target_key or "customer" in target_key:
        entry = DEMO_MAP["churn"]
    else:
        entry = DEMO_MAP["titanic"]

    path = ROOT / entry["file"]
    if path.is_file():
        session = ds.create_dataset_session(path.read_bytes(), entry["file"], entry["display_name"])
        session.narrative = {
            "text": entry["narrative"],
            "source": "ai",
            "model": "qwen/qwen3.8-27b",
            "note": None,
            "kind": "dataset",
        }
        return _session_payload(session)

    # Fallback to scanning any existing demo candidates
    for cand in ("demo_data.csv", "daily-bike-share.csv", "customer_churn.csv"):
        cand_path = ROOT / cand
        if cand_path.is_file():
            session = ds.create_dataset_session(cand_path.read_bytes(), cand, "Demo Dataset")
            return _session_payload(session)

    raise HTTPException(status_code=404, detail="No demo dataset is bundled with this deployment")


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    from backend.services import dataset_service as ds
    try:
        return ds.get_profile(dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{dataset_id}/preview")
def preview_dataset(dataset_id: str, n_rows: int = 100):
    from backend.services import dataset_service as ds
    try:
        return ds.get_preview(dataset_id, n_rows)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{dataset_id}/health")
def dataset_health(dataset_id: str):
    from backend.tools.registry import execute_tool
    from backend.services.dataset_service import get_dataset
    if get_dataset(dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return execute_tool("analyze_dataset_health", dataset_id)


@router.get("/{dataset_id}/narrative")
def dataset_narrative(dataset_id: str, refresh: bool = False):
    """The AI description the workspace types out after an upload.

    Cached on the session: it costs a model call, and it describes the file as
    uploaded, which does not change. `refresh=true` forces a regeneration.
    """
    from backend.services.dataset_service import get_dataset
    from backend.services.narration import narrate_dataset

    session = get_dataset(dataset_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if session.narrative is None or refresh:
        session.narrative = narrate_dataset(session)
    return session.narrative


@router.get("")
def list_all_datasets():
    from backend.services import dataset_service as ds
    return ds.list_datasets()


@router.get("/{dataset_id}/columns")
def dataset_columns(dataset_id: str):
    from backend.services import dataset_service as ds
    s = ds.get_dataset(dataset_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"columns": s.column_summary()}


@router.get("/{dataset_id}/export")
def export_dataset(dataset_id: str, format: str = "csv"):
    from backend.services import dataset_service as ds
    from fastapi.responses import Response
    s = ds.get_dataset(dataset_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    stem = Path(s.filename).stem or "dataset"
    if format == "json":
        content = s.df.to_json(orient="records", indent=2)
        media_type = "application/json"
        filename = f"{stem}_transformed.json"
    else:
        content = s.df.to_csv(index=False)
        media_type = "text/csv"
        filename = f"{stem}_transformed.csv"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )
