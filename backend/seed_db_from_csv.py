import os
import sys
import csv
import random
from datetime import datetime, timedelta

# Add current folder to sys.path so we can import supabase_client and ai_engine
sys.path.append(os.path.dirname(__file__))

import h3  # type: ignore
from supabase_client import supabase
from ai_engine import map_symptoms_to_disease
from database import DISTRICT_COORDS

# Map agency suffix to state name for IDSP data
AGENCY_TO_STATE = {
    "MH": "Maharashtra", "DL": "Delhi", "WB": "West Bengal", "TN": "Tamil Nadu",
    "TS": "Telangana", "KA": "Karnataka", "GJ": "Gujarat", "UP": "Uttar Pradesh",
    "BR": "Bihar", "AS": "Assam", "MP": "Madhya Pradesh", "KL": "Kerala",
    "RJ": "Rajasthan", "JK": "Jammu and Kashmir", "JH": "Jharkhand", "OD": "Odisha",
    "CG": "Chhattisgarh", "AP": "Andhra Pradesh", "MN": "Manipur", "ML": "Meghalaya",
    "MZ": "Mizoram", "TR": "Tripura", "UK": "Uttarakhand", "CH": "Chandigarh",
    "PY": "Puducherry"
}

# Bhopal sub-districts to their hex IDs
BHOPAL_DISTRICTS = {
    "Bhopal North": "8829a6b1fffffff",
    "Bhopal East": "8829a6b3fffffff",
    "Bhopal West": "8829a6b5fffffff",
    "Govindpura": "8829a6b7fffffff",
    "Huzur": "8829a6b9fffffff",
    "Kolar": "8829a6bbfffffff",
    "Misrod": "8829a6bdfffffff",
    "Phanda": "8829a6bffffffff",
    "Berasia": "8829a6c1fffffff"
}

# Map trends keywords to disease profiles
KEYWORD_MAP = {
    "fever_symptoms": ("fever symptoms", "Influenza A"),
    "dengue_fever_india": ("dengue fever india", "Dengue"),
    "viral_fever": ("viral fever", "Influenza A"),
    "flu_symptoms_india": ("flu symptoms india", "Influenza A"),
    "shortness_of_breath": ("shortness of breath", "COVID-19"),
    "food_poisoning_symptoms": ("food poisoning symptoms", "Typhoid"),
    "malaria_symptoms": ("malaria symptoms", "Malaria"),
    "typhoid_symptoms": ("typhoid symptoms", "Typhoid"),
    "chikungunya_india": ("chikungunya india", "Chikungunya"),
    "covid_symptoms_india": ("covid symptoms india", "COVID-19"),
}

def get_coords(district_name):
    # Try exact match first
    if district_name in DISTRICT_COORDS:
        return DISTRICT_COORDS[district_name]
    # Try case-insensitive substring match
    for name, coords in DISTRICT_COORDS.items():
        if name.lower() in district_name.lower() or district_name.lower() in name.lower():
            return coords
    # Default to Bhopal
    return (23.2599, 77.4126)

def parse_iso_week(week_str):
    # format: YYYY-Www, e.g. 2026-W18
    parts = week_str.split('-W')
    year = int(parts[0])
    week = int(parts[1])
    # Get the first day of that week (Monday)
    monday = datetime.strptime(f"{year}-W{week}-1", "%G-W%V-%u")
    onset_date = monday.strftime("%Y-%m-%d")
    report_date = (monday + timedelta(days=4)).strftime("%Y-%m-%d")
    return onset_date, report_date

def map_signal_to_disease(name, dominant_symptom):
    name_lower = name.lower()
    sym = dominant_symptom.lower().replace(" ", "_")
    if "respiratory" in name_lower:
        if sym == "cough":
            return "Influenza A"
        if sym == "shortness_of_breath":
            return "HMPV"
        return "Influenza A"
    elif "gi disturbance" in name_lower or "gi" in name_lower:
        if sym == "diarrhea":
            return "Cholera"
        if sym == "nausea" or sym == "vomiting":
            return "Rotavirus"
        return "Typhoid"
    else:
        if sym == "body_ache" or sym == "joint_pain" or sym == "rash":
            return "Dengue"
        if sym == "fever":
            return "Influenza A"
        return "Influenza A"

def map_idsp_disease(disease_name):
    d_lower = disease_name.lower().replace("-", " ").strip()
    if "influenza" in d_lower or "flu" in d_lower:
        return "Influenza A"
    if "nipah" in d_lower:
        return "Influenza A"
    if "encephalitis" in d_lower or "aes" in d_lower:
        return "Japanese Encephalitis"
    
    valid_diseases = [
        "Dengue", "Influenza A", "HMPV", "Cholera", "Leptospirosis", "Malaria", 
        "Typhoid", "Chikungunya", "COVID-19", "Measles", "Tuberculosis", 
        "Rotavirus", "Scrub Typhus", "Japanese Encephalitis"
    ]
    for d in valid_diseases:
        if d.lower() == d_lower:
            return d
            
    return "Influenza A"

def seed_database():
    if not supabase:
        print("Error: Supabase client not initialized. Check your environment variables.")
        sys.exit(1)

    data_dir = os.path.join(os.path.dirname(__file__), "data")
    
    # 1. Clear old data
    print("Clearing existing Supabase data...")
    try:
        res = supabase.table("reports_data").delete().neq("report_id", "xxxxxx").execute()
        print(f"Cleared reports_data.")
        res = supabase.table("signals_data").delete().neq("district", "xxxxxx").execute()
        print(f"Cleared signals_data.")
        res = supabase.table("trends_data").delete().neq("date", "xxxxxx").execute()
        print(f"Cleared trends_data.")
        res = supabase.table("who_idsp_groundtruth").delete().neq("record_id", "xxxxxx").execute()
        print(f"Cleared who_idsp_groundtruth.")
    except Exception as e:
        print(f"Error during clearing table rows: {e}")
        sys.exit(1)

    # 2. Seed reports_data
    reports_csv = os.path.join(data_dir, "reports_data.csv")
    print(f"Seeding reports_data from {reports_csv}...")
    reports_to_insert = []
    with open(reports_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
            symptoms_list = [s.strip() for s in row["symptoms"].split(",") if s.strip()]
            probable_disease = map_symptoms_to_disease(symptoms_list)
            
            try:
                lat, lon = h3.cell_to_latlng(row["hex_id"])
            except Exception:
                base_lat, base_lng = DISTRICT_COORDS.get("Bhopal", (23.2599, 77.4126))
                lat = base_lat + random.uniform(-0.02, 0.02)
                lon = base_lng + random.uniform(-0.02, 0.02)

            reports_to_insert.append({
                "report_id": row["anon_id"],
                "date": dt.strftime("%Y-%m-%d"),
                "hour": f"{dt.hour:02d}:00",
                "h3_hex": row["hex_id"],
                "district": row["district"],
                "state": "Madhya Pradesh",
                "symptom_tags": "|".join(symptoms_list),
                "severity": "moderate",
                "duration": "1-3 days",
                "trust_score": 0.8,
                "is_synthetic": 0,
                "probable_disease": probable_disease,
                "lat": lat,
                "lon": lon
            })
    
    if reports_to_insert:
        supabase.table("reports_data").insert(reports_to_insert).execute()
        print(f"Successfully inserted {len(reports_to_insert)} reports.")

    # 3. Seed signals_data
    signals_csv = os.path.join(data_dir, "signals_data.csv")
    print(f"Seeding signals_data from {signals_csv}...")
    signals_to_insert = []
    with open(signals_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt = datetime.fromisoformat(row["last_updated"].replace("Z", "+00:00"))
            conf = float(row["confidence"])
            signals_to_insert.append({
                "date": dt.strftime("%Y-%m-%d"),
                "h3_hex": row["hex_id"],
                "district": row["district"],
                "state": "Madhya Pradesh",
                "disease": map_signal_to_disease(row["name"], row["dominant_symptom"]),
                "trends_score": round(conf * 0.4 / 100.0, 3),
                "reports_score": round(int(row["report_count"]) / 100.0, 3),
                "convergence_score": round(conf / 100.0, 3),
                "confidence_pct": conf,
                "alert_triggered": 1 if conf >= 80 else 0,
                "day_number": dt.day
            })
    
    if signals_to_insert:
        supabase.table("signals_data").insert(signals_to_insert).execute()
        print(f"Successfully inserted {len(signals_to_insert)} signals.")

    # 4. Seed trends_data (replicated for all Bhopal districts)
    trends_csv = os.path.join(data_dir, "trends_data.csv")
    print(f"Seeding trends_data from {trends_csv}...")
    trends_to_insert = []
    with open(trends_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for district, hex_id in BHOPAL_DISTRICTS.items():
                try:
                    lat, lon = h3.cell_to_latlng(hex_id)
                except Exception:
                    lat, lon = 23.2599, 77.4126
                
                for col_name, (keyword, disease) in KEYWORD_MAP.items():
                    search_index = int(float(row[col_name]))
                    trends_to_insert.append({
                        "date": row["date"],
                        "district": district,
                        "state": "Madhya Pradesh",
                        "keyword": keyword,
                        "related_disease": disease,
                        "search_index": search_index,
                        "normalized_score": search_index / 100.0,
                        "lat": lat,
                        "lon": lon
                    })
    
    if trends_to_insert:
        # Insert in batches of 500
        batch_size = 500
        for i in range(0, len(trends_to_insert), batch_size):
            batch = trends_to_insert[i:i+batch_size]
            supabase.table("trends_data").insert(batch).execute()
        print(f"Successfully inserted {len(trends_to_insert)} trend records.")

    # 5. Seed who_idsp_groundtruth
    idsp_csv = os.path.join(data_dir, "idsp_data.csv")
    print(f"Seeding who_idsp_groundtruth from {idsp_csv}...")
    idsp_to_insert = []
    idsp_counter = 1
    with open(idsp_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            onset_date, report_date = parse_iso_week(row["week"])
            agency = row["source_agency"]
            suffix = agency.split("-")[1] if "-" in agency else "MP"
            state = AGENCY_TO_STATE.get(suffix, "Madhya Pradesh")
            lat, lon = get_coords(row["district"])
            
            alert_map = {
                "outbreak": "Active Outbreak",
                "alert": "Localized Alert",
                "watch": "Under Watch",
                "none": "Sporadic"
            }
            status = alert_map.get(row["alert_level"], "Sporadic")
            
            idsp_to_insert.append({
                "record_id": f"IDSP{idsp_counter:05d}",
                "onset_date": onset_date,
                "report_date": report_date,
                "district": row["district"],
                "state": state,
                "disease": map_idsp_disease(row["disease"]),
                "confirmed_cases": int(row["confirmed_cases"]),
                "suspected_cases": int(row["suspected_cases"]),
                "deaths": int(row["deaths"]),
                "hospitalised": int(int(row["confirmed_cases"]) * 0.15),
                "outbreak_status": status,
                "data_source": "WHO SEARO" if "WHO" in agency else "IDSP India",
                "verification_type": "Confirmed" if int(row["confirmed_cases"]) > 0 else "Under Review",
                "lat": lat,
                "lon": lon
            })
            idsp_counter += 1

    if idsp_to_insert:
        # Insert in batches of 200
        batch_size = 200
        for i in range(0, len(idsp_to_insert), batch_size):
            batch = idsp_to_insert[i:i+batch_size]
            supabase.table("who_idsp_groundtruth").insert(batch).execute()
        print(f"Successfully inserted {len(idsp_to_insert)} IDSP ground truth records.")

    print("\nDatabase synchronization completed successfully!")

if __name__ == "__main__":
    seed_database()
