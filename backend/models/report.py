from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class ReportRecord:
    report_id: str
    dataset_id: str | None
    created_at: str
    sections: list = field(default_factory=list)
    pdf_path: str | None = None
