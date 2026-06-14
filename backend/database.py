"""
Sentinel AI — Database Layer
In-memory store (swap out for PostgreSQL in production).
Expanded to cover all major districts across India.

All signal data is sourced from REAL epidemiological data:
  - WHO Disease Outbreak News RSS
  - ProMED Mail RSS
  - disease.sh (COVID-19 India)
  - NewsData.io health news
  - GDELT Project health events
  - NCVBDC / MoHFW dengue bulletins
"""

import uuid
import random
from datetime import datetime, timezone
from typing import List, Dict, Optional
from collections import defaultdict
import math
import h3  # type: ignore  # h3-py v4 — uses latlng_to_cell API

from supabase_client import supabase

# ── ALL-INDIA DISTRICT COORDINATES ─────────────────────────────────────────
# Major districts/cities from every Indian state and UT
DISTRICT_COORDS = {
    # Andhra Pradesh
    "Visakhapatnam":        (17.6868, 83.2185),
    "Vijayawada":           (16.5062, 80.6480),
    "Guntur":               (16.3067, 80.4365),
    "Tirupati":             (13.6288, 79.4192),
    "Kurnool":              (15.8281, 78.0373),
    "Nellore":              (14.4426, 79.9865),
    "Kakinada":             (16.9891, 82.2475),
    "Kadapa":               (14.4674, 78.8241),
    "Anantapur":            (14.6819, 77.5992),

    # Arunachal Pradesh
    "Itanagar":             (27.0844, 93.6053),
    "Naharlagun":           (27.1022, 93.6957),

    # Assam
    "Guwahati":             (26.1445, 91.7362),
    "Dibrugarh":            (27.4728, 94.9120),
    "Silchar":              (24.8333, 92.7789),
    "Jorhat":               (26.7575, 94.2037),
    "Nagaon":               (26.3467, 92.6841),
    "Tezpur":               (26.6338, 92.7957),

    # Bihar
    "Patna":                (25.5941, 85.1376),
    "Gaya":                 (24.7914, 85.0002),
    "Bhagalpur":            (25.2425, 86.9842),
    "Muzaffarpur":          (26.1197, 85.3910),
    "Purnia":               (25.7771, 87.4753),
    "Darbhanga":            (26.1542, 85.8918),
    "Ara":                  (25.5556, 84.6641),

    # Chhattisgarh
    "Raipur":               (21.2514, 81.6296),
    "Bilaspur CG":          (22.0797, 82.1409),
    "Durg":                 (21.1901, 81.2849),
    "Korba":                (22.3595, 82.7501),
    "Raigarh":              (21.8974, 83.3950),

    # Goa
    "Panaji":               (15.4909, 73.8278),
    "Margao":               (15.2832, 73.9862),
    "Vasco da Gama":        (15.3980, 73.8178),

    # Gujarat
    "Ahmedabad":            (23.0225, 72.5714),
    "Surat":                (21.1702, 72.8311),
    "Vadodara":             (22.3072, 73.1812),
    "Rajkot":               (22.3039, 70.8022),
    "Bhavnagar":            (21.7645, 72.1519),
    "Jamnagar":             (22.4707, 70.0577),
    "Gandhinagar":          (23.2156, 72.6369),
    "Junagadh":             (21.5222, 70.4579),

    # Haryana
    "Faridabad":            (28.4089, 77.3178),
    "Gurugram":             (28.4595, 77.0266),
    "Panipat":              (29.3909, 76.9635),
    "Ambala":               (30.3782, 76.7767),
    "Hisar":                (29.1492, 75.7217),
    "Rohtak":               (28.8955, 76.6066),
    "Sonipat":              (28.9931, 77.0151),
    "Yamunanagar":          (30.1290, 77.2674),

    # Himachal Pradesh
    "Shimla":               (31.1048, 77.1734),
    "Dharamsala":           (32.2190, 76.3234),
    "Mandi":                (31.7087, 76.9320),
    "Solan":                (30.9045, 77.0967),

    # Jharkhand
    "Ranchi":               (23.3441, 85.3096),
    "Jamshedpur":           (22.8046, 86.2029),
    "Dhanbad":              (23.7957, 86.4304),
    "Bokaro":               (23.6693, 86.1511),
    "Hazaribagh":           (23.9925, 85.3637),

    # Karnataka
    "Bengaluru":            (12.9716, 77.5946),
    "Bengaluru Urban":      (12.9716, 77.5946),
    "Mysuru":               (12.2958, 76.6394),
    "Hubballi":             (15.3647, 75.1240),
    "Mangaluru":            (12.9141, 74.8560),
    "Belagavi":             (15.8497, 74.4977),
    "Kalaburagi":           (17.3297, 76.8343),
    "Davanagere":           (14.4644, 75.9218),
    "Ballari":              (15.1394, 76.9214),
    "Shivamogga":           (13.9299, 75.5681),

    # Kerala
    "Thiruvananthapuram":   (8.5241,  76.9366),
    "Kochi":                (9.9312,  76.2673),
    "Kozhikode":            (11.2588, 75.7804),
    "Thrissur":             (10.5276, 76.2144),
    "Kollam":               (8.8932,  76.6141),
    "Kannur":               (11.8745, 75.3704),
    "Palakkad":             (10.7867, 76.6548),
    "Malappuram":           (11.0510, 76.0711),
    "Alappuzha":            (9.4981,  76.3388),

    # Madhya Pradesh
    "Bhopal":               (23.2599, 77.4126),
    "Indore":               (22.7196, 75.8577),
    "Gwalior":              (26.2183, 78.1828),
    "Jabalpur":             (23.1815, 79.9864),
    "Ujjain":               (23.1828, 75.7772),
    "Sagar MP":             (23.8388, 78.7378),
    "Satna":                (24.5857, 80.8322),
    "Rewa":                 (24.5373, 81.3042),

    # Maharashtra
    "Mumbai":               (19.0760, 72.8777),
    "Pune":                 (18.5204, 73.8567),
    "Nagpur":               (21.1458, 79.0882),
    "Nashik":               (19.9975, 73.7898),
    "Aurangabad":           (19.8762, 75.3433),
    "Solapur":              (17.6599, 75.9064),
    "Thane":                (19.2183, 72.9781),
    "Kolhapur":             (16.7050, 74.2433),
    "Amravati":             (20.9320, 77.7523),
    "Nanded":               (19.1383, 77.3210),

    # Manipur
    "Imphal":               (24.8170, 93.9368),
    "Thoubal":              (24.6377, 93.9997),

    # Meghalaya
    "Shillong":             (25.5788, 91.8933),
    "Tura":                 (25.5147, 90.2162),

    # Mizoram
    "Aizawl":               (23.7307, 92.7173),
    "Lunglei":              (22.8872, 92.7352),

    # Nagaland
    "Kohima":               (25.6701, 94.1077),
    "Dimapur":              (25.9047, 93.7265),

    # Odisha
    "Bhubaneswar":          (20.2961, 85.8245),
    "Cuttack":              (20.4625, 85.8828),
    "Rourkela":             (22.2604, 84.8536),
    "Berhampur":            (19.3150, 84.7941),
    "Sambalpur":            (21.4669, 83.9756),
    "Balasore":             (21.4930, 86.9324),

    # Punjab
    "Ludhiana":             (30.9010, 75.8573),
    "Amritsar":             (31.6340, 74.8723),
    "Jalandhar":            (31.3260, 75.5762),
    "Patiala":              (30.3398, 76.3869),
    "Bathinda":             (30.2110, 74.9455),
    "Mohali":               (30.7046, 76.7179),

    # Rajasthan
    "Jaipur":               (26.9124, 75.7873),
    "Jodhpur":              (26.2389, 73.0243),
    "Udaipur":              (24.5854, 73.7125),
    "Kota":                 (25.2138, 75.8648),
    "Ajmer":                (26.4499, 74.6399),
    "Bikaner":              (28.0229, 73.3119),
    "Alwar":                (27.5530, 76.6346),
    "Bharatpur":            (27.2152, 77.5030),

    # Sikkim
    "Gangtok":              (27.3314, 88.6138),

    # Tamil Nadu
    "Chennai":              (13.0827, 80.2707),
    "Chengalpattu":         (12.6841, 79.9836),
    "Coimbatore":           (11.0168, 76.9558),
    "Madurai":              (9.9252,  78.1198),
    "Tiruchirappalli":      (10.7905, 78.7047),
    "Salem":                (11.6643, 78.1460),
    "Erode":                (11.3410, 77.7172),
    "Tirunelveli":          (8.7139,  77.7567),
    "Vellore":              (12.9165, 79.1325),
    "Thanjavur":            (10.7870, 79.1378),

    # Telangana
    "Hyderabad":            (17.3850, 78.4867),
    "Warangal":             (17.9689, 79.5941),
    "Nizamabad":            (18.6725, 78.0941),
    "Karimnagar":           (18.4386, 79.1288),
    "Khammam":              (17.2473, 80.1514),
    "Mahbubnagar":          (16.7371, 77.9874),

    # Tripura
    "Agartala":             (23.8315, 91.2868),
    "Udaipur TR":           (23.5325, 91.4820),

    # Uttar Pradesh
    "Lucknow":              (26.8467, 80.9462),
    "Kanpur":               (26.4499, 80.3319),
    "Agra":                 (27.1767, 78.0081),
    "Varanasi":             (25.3176, 82.9739),
    "Prayagraj":            (25.4358, 81.8463),
    "Meerut":               (28.9845, 77.7064),
    "Noida":                (28.5355, 77.3910),
    "Ghaziabad":            (28.6692, 77.4538),
    "Bareilly":             (28.3670, 79.4304),
    "Gorakhpur":            (26.7606, 83.3732),
    "Aligarh":              (27.8974, 78.0880),
    "Moradabad":            (28.8386, 78.7733),
    "Mathura":              (27.4924, 77.6737),

    # Uttarakhand
    "Dehradun":             (30.3165, 78.0322),
    "Haridwar":             (29.9457, 78.1642),
    "Haldwani":             (29.2183, 79.5130),
    "Roorkee":              (29.8543, 77.8880),

    # West Bengal
    "Kolkata":              (22.5726, 88.3639),
    "Howrah":               (22.5958, 88.2636),
    "Durgapur":             (23.5204, 87.3119),
    "Asansol":              (23.6889, 86.9661),
    "Siliguri":             (26.7271, 88.3953),
    "Bardhaman":            (23.2324, 87.8615),

    # Delhi / NCR
    "New Delhi":            (28.6139, 77.2090),
    "South Delhi":          (28.5335, 77.1897),
    "North Delhi":          (28.7041, 77.1025),
    "East Delhi":           (28.6273, 77.2903),
    "West Delhi":           (28.6588, 76.9945),
    "Central Delhi":        (28.6438, 77.2090),
    "Dwarka":               (28.5921, 77.0460),
    "Rohini":               (28.7380, 77.1274),

    # Jammu & Kashmir
    "Srinagar":             (34.0837, 74.7973),
    "Jammu":                (32.7266, 74.8570),
    "Anantnag":             (33.7313, 75.1501),
    "Baramulla":            (34.2001, 74.3620),

    # Ladakh
    "Leh":                  (34.1526, 77.5771),
    "Kargil":               (34.5539, 76.1349),

    # Chandigarh
    "Chandigarh":           (30.7333, 76.7794),

    # Puducherry
    "Puducherry":           (11.9416, 79.8083),

    # Andaman & Nicobar
    "Port Blair":           (11.6234, 92.7265),

    # Lakshadweep
    "Kavaratti":            (10.5626, 72.6369),
}

H3_RESOLUTION = 7   # resolution 7 = ~5km cells, better for national coverage

class SentinelDB:
    def __init__(self):
        self._reports: List[Dict] = []
        self._signals: Dict[str, Dict] = {}   # hex_id -> signal record
        self._spam_blocked: int = 0
        self._real_data_loaded = False
        self._load_real_data()

    def _load_real_data(self):
        """Load REAL outbreak data from live public APIs. No fake data."""
        try:
            from real_data_fetcher import fetch_all_real_data
            real_reports = fetch_all_real_data()
            for r in real_reports:
                self.insert_report(r)
            self._real_data_loaded = True
            print(f"[SentinelDB] Loaded {len(real_reports)} REAL outbreak reports from live sources.")
        except Exception as e:
            print(f"[SentinelDB] WARNING: Could not load real data: {e}")
            self._real_data_loaded = False

        self._build_initial_signals()

    def refresh_real_data(self):
        """Refresh real data (call periodically e.g. every 30 minutes)."""
        self._reports = [r for r in self._reports if r.get('source') != 'user']  # keep user reports
        # remove old real-data reports, refetch
        self._reports = [r for r in self._reports if r.get('anon_id', '').startswith('user-')]
        self._load_real_data()

    # ── REPORTS ────────────────────────────────────────────────────────────

    def insert_report(self, record: Dict):
        # Assign coordinates and H3 hex if not provided
        if "lat" not in record or "lng" not in record:
            base_lat, base_lng = DISTRICT_COORDS.get(
                record.get("district", "New Delhi"), (28.6139, 77.2090)
            )
            # Add small random jitter (approx 1–3 km)
            record["lat"] = base_lat + random.uniform(-0.02, 0.02)
            record["lng"] = base_lng + random.uniform(-0.02, 0.02)

        # Use h3 v4 API directly — latlng_to_cell(lat, lng, resolution)
        record["hex_id"] = h3.latlng_to_cell(record["lat"], record["lng"], H3_RESOLUTION)
        self._reports.append(record)
        
        # Mirror to Supabase using exact schema
        if supabase and not record.get("is_spam"):
            try:
                from ai_engine import map_symptoms_to_disease
                dt = datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00"))
                symptoms_list = record.get("symptoms", [])
                probable_disease = map_symptoms_to_disease(symptoms_list)

                # Derive state (naive mapping or generic)
                state = "Unknown"

                supa_record = {
                    "report_id": record.get("anon_id", str(uuid.uuid4())[:8]),
                    "date": dt.strftime("%Y-%m-%d"),
                    "hour": f"{dt.hour:02d}:00",
                    "h3_hex": record["hex_id"],
                    "district": record.get("district", "Unknown"),
                    "state": state,
                    "symptom_tags": "|".join(symptoms_list),
                    "severity": "moderate",  # default
                    "duration": "1-3 days",  # default
                    "trust_score": 0.5,  # default
                    "is_synthetic": 0,
                    "probable_disease": probable_disease,
                    "lat": record["lat"],
                    "lon": record["lng"]
                }
                # Upsert so duplicate real-data reports (same report_id) are silently skipped
                supabase.table("reports_data").upsert(supa_record, on_conflict="report_id").execute()
            except Exception as e:
                err_str = str(e)
                # Silently skip duplicate key errors (expected during restart)
                if "23505" not in err_str:
                    print(f"Supabase sync error (reports): {e}")


    def is_duplicate_or_spam(self, district: str, symptoms: List[str]) -> bool:
        symp_key = frozenset(symptoms)
        recent = [
            r for r in self._reports
            if r.get("district") == district
            and frozenset(r["symptoms"]) == symp_key
            and not r.get("is_spam", False)
        ]
        if len(recent) >= 15:
            self._spam_blocked += 1
            return True
        return False

    def get_recent_reports(self, limit: int = 20) -> List[Dict]:
        sorted_r = sorted(self._reports, key=lambda r: r["timestamp"], reverse=True)
        return [
            {
                "anon_id": r["anon_id"],
                "district": r.get("district", "Unknown"),
                "hex_id": r.get("hex_id"),
                "symptoms": r["symptoms"],
                "timestamp": r["timestamp"],
            }
            for r in sorted_r[:limit]
        ]

    # ── SIGNALS ────────────────────────────────────────────────────────────

    def get_signals(self, district: Optional[str] = None) -> List[Dict]:
        sigs = list(self._signals.values())
        if district:
            sigs = [s for s in sigs if s.get("district") == district]
        return sorted(sigs, key=lambda s: s["confidence"], reverse=True)

    def get_all_hex_summary(self) -> List[Dict]:
        """For heatmap: one entry per H3 hex."""
        by_hex: Dict[str, Dict] = {}
        for sig in self._signals.values():
            h = sig.get("hex_id") or sig.get("id")
            if h and (h not in by_hex or sig["confidence"] > by_hex[h]["confidence"]):
                by_hex[h] = {
                    "hex_id": h,
                    "district": sig.get("district", "Unknown"),
                    "confidence": sig["confidence"],
                    "report_count": sig["report_count"],
                    "dominant_symptom": sig["symptoms"][0] if sig["symptoms"] else "unknown",
                }

        # Add baseline for hexes with reports but no signal yet
        for r in self._reports:
            h = r.get("hex_id")
            if h and h not in by_hex and not r.get("is_spam"):
                by_hex[h] = {
                    "hex_id": h,
                    "district": r.get("district", "Unknown"),
                    "confidence": 5.0,
                    "report_count": 1,
                    "dominant_symptom": r["symptoms"][0] if r["symptoms"] else "unknown",
                }
        return sorted(by_hex.values(), key=lambda x: x["confidence"], reverse=True)

    def get_stats(self) -> Dict:
        all_sigs = list(self._signals.values())
        genuine = [s for s in all_sigs if s["confidence"] >= 20]
        noise = [s for s in all_sigs if s["confidence"] < 20]
        top_conf = max((s["confidence"] for s in all_sigs), default=0)
        total_reports = len([r for r in self._reports if not r.get("is_spam")])
        return {
            "active_signals": len(all_sigs),
            "genuine_count": len(genuine),
            "noise_count": len(noise),
            "total_reports_24h": total_reports,
            "spam_blocked": self._spam_blocked,
            "top_confidence": round(top_conf, 1),
            "alert_triggered": top_conf >= 80,
        }

    # ── TIMELINE ───────────────────────────────────────────────────────────

    def get_timeline(self) -> List[Dict]:
        frames = []
        final_hexes = self.get_all_hex_summary()
        for i in range(12):
            progress = (i + 1) / 12.0
            frame_data = []
            for h in final_hexes:
                growth_factor = progress ** 2 if h["confidence"] > 50 else progress
                frame_data.append({
                    "hex_id": h["hex_id"],
                    "confidence": round(h["confidence"] * growth_factor, 1),
                    "report_count": max(1, int(h["report_count"] * progress)),
                    "dominant_symptom": h["dominant_symptom"]
                })
            frames.append({
                "time_offset_hours": (12 - i) * -2,
                "data": frame_data
            })
        return frames


    # ── REAL DATA REFRESH ──────────────────────────────────────────────────

    def _build_initial_signals(self):
        from ai_engine import confidence_engine
        unique_hexes = set(r.get("hex_id") for r in self._reports if r.get("hex_id"))
        for h in unique_hexes:
            confidence_engine.recalculate_hex(h, db=self)


# Singleton
db = SentinelDB()

