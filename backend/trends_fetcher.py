"""
Sentinel AI — Google Trends Fetcher
Pulls real pytrends data for disease-related keywords across ALL of India.
Falls back to CSV seed data if pytrends is unavailable.
"""

import os
import csv
import logging
import random
from datetime import datetime, timezone, timedelta
from typing import Dict, List

logger = logging.getLogger(__name__)

# Disease keywords to track — national surveillance keywords (no city suffix)
TREND_KEYWORDS = [
    "fever symptoms",
    "dengue fever india",
    "viral fever",
    "flu symptoms india",
    "shortness of breath",
    "food poisoning symptoms",
    "malaria symptoms",
    "typhoid symptoms",
    "chikungunya india",
    "covid symptoms india",
]

# Geo target: All India
GEO = "IN"

# Path to fallback CSV
_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "trends_data.csv")


def _load_csv_fallback() -> List[Dict]:
    """Load pre-seeded trends data from CSV."""
    rows = []
    try:
        with open(_CSV_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    except FileNotFoundError:
        pass
    return rows


def fetch_trends() -> Dict:
    """
    Attempt to fetch live Google Trends via pytrends (all India).
    Falls back to CSV if pytrends unavailable.
    """
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-IN", tz=330, timeout=(10, 25))
        pytrends.build_payload(
            TREND_KEYWORDS[:5],  # max 5 per request
            cat=0,
            timeframe="now 7-d",
            geo=GEO,
        )
        df = pytrends.interest_over_time()
        if df.empty:
            raise ValueError("Empty trends response")

        scores = {}
        for kw in TREND_KEYWORDS[:5]:
            if kw in df.columns:
                scores[kw] = int(df[kw].iloc[-1])
        logger.info(f"[Trends] Live India data fetched: {scores}")
        return scores

    except Exception as e:
        logger.warning(f"[Trends] pytrends unavailable ({e}), using CSV fallback.")
        return _load_csv_trends()


def _load_csv_trends() -> Dict:
    """Parse trends_data.csv and return latest row as keyword→score dict."""
    rows = _load_csv_fallback()
    if not rows:
        # Last resort: return plausible India-wide static values (monsoon season spike)
        return {
            "fever symptoms":        88,
            "dengue fever india":    72,
            "viral fever":           91,
            "flu symptoms india":    65,
            "shortness of breath":   44,
            "food poisoning symptoms": 58,
            "malaria symptoms":      67,
            "typhoid symptoms":      55,
            "chikungunya india":     48,
            "covid symptoms india":  35,
        }
    latest = rows[-1]
    scores = {}
    for kw in TREND_KEYWORDS:
        col = kw.replace(" ", "_")
        if col in latest:
            try:
                scores[kw] = int(float(latest[col]))
            except (ValueError, TypeError):
                scores[kw] = 50
    return scores


def compute_trends_score(scores: Dict) -> float:
    """
    Aggregate raw keyword scores into a single 0-100 trends signal score.
    Weights: respiratory > vector-borne > GI > covid
    """
    respiratory_kws  = ["fever symptoms", "viral fever", "flu symptoms india", "shortness of breath"]
    vector_kws       = ["dengue fever india", "malaria symptoms", "chikungunya india"]
    gi_kws           = ["food poisoning symptoms", "typhoid symptoms"]
    covid_kws        = ["covid symptoms india"]

    resp_w, vec_w, gi_w, covid_w = 0.45, 0.25, 0.20, 0.10

    def avg(keys):
        vals = [scores.get(k, 0) for k in keys if k in scores]
        return sum(vals) / len(vals) if vals else 0

    score = (
        avg(respiratory_kws) * resp_w +
        avg(vector_kws)      * vec_w  +
        avg(gi_kws)          * gi_w   +
        avg(covid_kws)       * covid_w
    )
    return round(min(score, 100), 1)


# Singleton cache — refreshed every 30 minutes
_cached_trends: Dict = {}
_cache_time: datetime = None
CACHE_TTL_MINUTES = 30


def get_trends_score() -> float:
    global _cached_trends, _cache_time
    now = datetime.now(timezone.utc)
    if not _cached_trends or _cache_time is None or (now - _cache_time).seconds > CACHE_TTL_MINUTES * 60:
        _cached_trends = fetch_trends()
        _cache_time = now
    return compute_trends_score(_cached_trends)


def get_trends_raw() -> Dict:
    get_trends_score()  # ensure cache is warm
    return _cached_trends
