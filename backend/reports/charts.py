from __future__ import annotations


def chart_payload(chart_type: str, labels: list, values: list) -> dict:
    return {"type": chart_type, "labels": labels, "values": values}
