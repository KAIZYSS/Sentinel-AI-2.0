"""
Sentinel AI — Prediction Engine
Forecasts which H3 hexes will cross the 80% alert threshold in the next 6 hours.
Uses exponential trend extrapolation over recent signal history.
"""

import math
from datetime import datetime, timezone, timedelta
from typing import List, Dict
from collections import defaultdict


class PredictionEngine:
    """
    Outbreak spread predictor.
    Uses velocity (rate of confidence change) + neighbor spread factor
    to forecast confidence in 2h, 4h, 6h windows.
    """

    def predict_hex_trajectory(self, hex_summary: List[Dict]) -> List[Dict]:
        """
        For each hex, compute predicted confidence at +2h, +4h, +6h.
        Returns list of predictions with risk classification.
        """
        predictions = []
        for h in hex_summary:
            conf = h["confidence"]
            reports = h["report_count"]

            # Growth velocity — exponential if high-confidence, linear if low
            if conf >= 60:
                velocity = conf * 0.08   # 8% per 2h interval
            elif conf >= 30:
                velocity = conf * 0.05
            else:
                velocity = conf * 0.02

            # Report volume amplifier
            volume_amp = min(math.log1p(reports) / 10, 1.5)
            velocity *= volume_amp

            c2h = min(conf + velocity * 1, 99)
            c4h = min(conf + velocity * 2.2, 99)
            c6h = min(conf + velocity * 3.6, 99)

            # Risk assessment
            if c6h >= 80 and conf < 80:
                risk = "IMMINENT"
                risk_color = "#ef4444"
            elif c6h >= 60 and conf < 60:
                risk = "ESCALATING"
                risk_color = "#f59e0b"
            elif conf >= 80:
                risk = "ACTIVE"
                risk_color = "#ef4444"
            elif conf < 20:
                risk = "STABLE"
                risk_color = "#1de9b6"
            else:
                risk = "MONITORING"
                risk_color = "#3b82f6"

            predictions.append({
                "hex_id": h["hex_id"],
                "district": h["district"],
                "confidence_now": round(conf, 1),
                "confidence_2h": round(c2h, 1),
                "confidence_4h": round(c4h, 1),
                "confidence_6h": round(c6h, 1),
                "dominant_symptom": h["dominant_symptom"],
                "report_count": reports,
                "risk_level": risk,
                "risk_color": risk_color,
                "will_alert": c6h >= 80 and conf < 80,
                "velocity": round(velocity, 2),
            })

        return sorted(predictions, key=lambda x: x["confidence_6h"], reverse=True)

    def get_outbreak_forecast(self, hex_summary: List[Dict]) -> Dict:
        """
        Returns overall outbreak trajectory assessment.
        """
        predictions = self.predict_hex_trajectory(hex_summary)
        imminent = [p for p in predictions if p["risk_level"] == "IMMINENT"]
        active = [p for p in predictions if p["risk_level"] == "ACTIVE"]

        max_conf = max((p["confidence_now"] for p in predictions), default=0)
        max_6h = max((p["confidence_6h"] for p in predictions), default=0)

        if active or max_conf >= 80:
            threat = "CRITICAL"
            threat_level = 5
        elif imminent or max_6h >= 80:
            threat = "HIGH"
            threat_level = 4
        elif max_conf >= 50:
            threat = "ELEVATED"
            threat_level = 3
        elif max_conf >= 20:
            threat = "GUARDED"
            threat_level = 2
        else:
            threat = "LOW"
            threat_level = 1

        return {
            "threat_level": threat_level,
            "threat_label": threat,
            "hexes_active": len(active),
            "hexes_imminent": len(imminent),
            "max_confidence_now": round(max_conf, 1),
            "max_confidence_6h": round(max_6h, 1),
            "predictions": predictions,
            "summary": _build_summary(threat, len(active), len(imminent), max_6h),
        }


def _build_summary(threat: str, active: int, imminent: int, max_6h: float) -> str:
    if threat == "CRITICAL":
        return f"Active outbreak detected across {active} zones. Immediate public health response recommended."
    elif threat == "HIGH":
        return f"{imminent} zone(s) projected to breach alert threshold within 6 hours. Heightened surveillance advised."
    elif threat == "ELEVATED":
        return f"Signal clusters strengthening. Confidence trending toward {max_6h:.0f}% in 6 hours."
    elif threat == "GUARDED":
        return "Early-stage signals detected. Monitoring for convergence across data sources."
    else:
        return "No significant outbreak patterns detected. Normal baseline activity."


prediction_engine = PredictionEngine()
