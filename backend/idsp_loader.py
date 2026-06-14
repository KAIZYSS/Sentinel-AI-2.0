"""
Sentinel AI — WHO / IDSP Ground Truth Loader
Loads retrospective outbreak records from idsp_data.csv.
Used as the anchor/validation layer for confidence scoring.
IDSP = Integrated Disease Surveillance Programme (India)
"""

import os
import csv
from typing import List, Dict, Optional
from datetime import datetime, timezone

_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "idsp_data.csv")


def load_idsp_records() -> List[Dict]:
    """Load all IDSP retrospective records from CSV."""
    records = []
    try:
        with open(_CSV_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                records.append({
                    "week": row.get("week", ""),
                    "district": row.get("district", ""),
                    "disease": row.get("disease", ""),
                    "suspected_cases": int(row.get("suspected_cases", 0)),
                    "confirmed_cases": int(row.get("confirmed_cases", 0)),
                    "deaths": int(row.get("deaths", 0)),
                    "alert_level": row.get("alert_level", "none"),  # none / watch / alert / outbreak
                    "source": "IDSP",
                })
    except FileNotFoundError:
        print("[IDSP] idsp_data.csv not found, returning empty ground truth.")
    return records


def get_anchor_score(district: str, disease_keywords: List[str]) -> float:
    """
    Cross-references IDSP records for this district.
    Returns a 0–100 anchor score:
      - 0  = no IDSP data
      - 40 = watch-level alert in district
      - 70 = IDSP alert in district
      - 95 = IDSP outbreak in district
    """
    records = load_idsp_records()
    district_records = [
        r for r in records
        if r["district"].lower() in district.lower() or district.lower() in r["district"].lower()
    ]
    if not district_records:
        return 0.0

    # Find worst alert level for this district
    level_map = {"none": 0, "watch": 40, "alert": 70, "outbreak": 95}
    max_level = max(level_map.get(r["alert_level"], 0) for r in district_records)
    return float(max_level)


def get_idsp_summary() -> List[Dict]:
    """Return all IDSP records for the /api/groundtruth endpoint."""
    return load_idsp_records()


def get_district_idsp(district: str) -> List[Dict]:
    """Return IDSP records filtered for a specific district."""
    records = load_idsp_records()
    return [
        r for r in records
        if r["district"].lower() in district.lower() or district.lower() in r["district"].lower()
    ]
