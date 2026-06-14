"""
Sentinel AI — Location Normalization Layer
Resolves a locality or suburb name to the nearest supported surveillance district.
"""

import math
import json
import logging
import urllib.request
import urllib.parse
import difflib
from database import DISTRICT_COORDS

logger = logging.getLogger(__name__)

# Supported districts are keys in DISTRICT_COORDS
SUPPORTED_DISTRICTS = list(DISTRICT_COORDS.keys())

# Hardcoded mappings for known localities
KNOWN_LOCALITIES = {
    "keezhakottaiyur": "Chengalpattu",
    "siruseri": "Chengalpattu",
    "navalur": "Chengalpattu",
    "sholinganallur": "Chennai",
    "whitefield": "Bengaluru Urban",
    "electronic city": "Bengaluru Urban",
}

def clean_string(s):
    if not s:
        return ""
    return s.strip().lower()

def haversine_distance(lat1, lon1, lat2, lon2):
    # radius of earth in km
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c

def geocoder_lookup(location_name):
    """
    Perform OpenStreetMap Nominatim search for location_name in India.
    """
    try:
        query = f"{location_name.strip()}, India"
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(query)}&format=json&limit=1&addressdetails=1"
        
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'SentinelAI-Location-Resolver/2.0'}
        )
        # Use a reasonable timeout (5 seconds) to avoid freezing requests
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data:
                    return data[0]
    except Exception as e:
        logger.warning(f"Geocoder lookup error for '{location_name}': {e}")
    return None

def resolve_location(location_name):
    """
    Resolve a locality name to the best-matching supported Sentinel AI district.
    
    Returns:
    {
      "original": "Keezhakottaiyur",
      "district": "Chengalpattu",
      "confidence": 0.98
    }
    """
    if not location_name or not location_name.strip():
        return {
            "original": location_name or "",
            "district": "Bhopal",
            "confidence": 0.50
        }
    
    query_clean = clean_string(location_name)
    
    # Priority 1: Exact district match
    for dist in SUPPORTED_DISTRICTS:
        if clean_string(dist) == query_clean:
            return {
                "original": location_name,
                "district": dist,
                "confidence": 1.0
            }
            
    # Priority 2: Known locality mapping
    if query_clean in KNOWN_LOCALITIES:
        return {
            "original": location_name,
            "district": KNOWN_LOCALITIES[query_clean],
            "confidence": 0.98
        }
        
    # Priority 3: Fuzzy matching
    # Check close matches in supported districts
    best_dist = None
    best_dist_score = 0.0
    for dist in SUPPORTED_DISTRICTS:
        ratio = difflib.SequenceMatcher(None, query_clean, clean_string(dist)).ratio()
        if ratio > best_dist_score:
            best_dist_score = ratio
            best_dist = dist
            
    # Check close matches in known localities
    best_loc = None
    best_loc_score = 0.0
    for loc in KNOWN_LOCALITIES.keys():
        ratio = difflib.SequenceMatcher(None, query_clean, clean_string(loc)).ratio()
        if ratio > best_loc_score:
            best_loc_score = ratio
            best_loc = loc
            
    # Use the best fuzzy match above threshold (0.75)
    if best_dist_score >= 0.75 or best_loc_score >= 0.75:
        if best_dist_score >= best_loc_score:
            return {
                "original": location_name,
                "district": best_dist,
                "confidence": round(best_dist_score, 2)
            }
        else:
            return {
                "original": location_name,
                "district": KNOWN_LOCALITIES[best_loc],
                "confidence": round(0.98 * best_loc_score, 2)
            }

    # Priority 4: Geocoder lookup
    geo_data = geocoder_lookup(location_name)
    if geo_data:
        try:
            # Check address fields for name matches first
            address = geo_data.get("address", {})
            for key in ["county", "district", "state_district", "city", "town", "municipality"]:
                val = address.get(key)
                if val:
                    val_clean = clean_string(val)
                    # Check exact
                    for dist in SUPPORTED_DISTRICTS:
                        if clean_string(dist) == val_clean:
                            return {
                                "original": location_name,
                                "district": dist,
                                "confidence": 0.90
                            }
                    # Check overrides/known mapping
                    if val_clean in KNOWN_LOCALITIES:
                        return {
                            "original": location_name,
                            "district": KNOWN_LOCALITIES[val_clean],
                            "confidence": 0.88
                        }
            
            # Map by geographical coordinates to the closest supported district
            lat = float(geo_data.get("lat"))
            lon = float(geo_data.get("lon"))
            
            min_dist = float('inf')
            nearest_district = "Bhopal"
            
            for dist, coords in DISTRICT_COORDS.items():
                d = haversine_distance(lat, lon, coords[0], coords[1])
                if d < min_dist:
                    min_dist = d
                    nearest_district = dist
            
            # Assign confidence relative to distance (closer = higher, caps at 0.85)
            confidence = max(0.60, round(0.85 - (min_dist / 5000.0), 2))
            
            return {
                "original": location_name,
                "district": nearest_district,
                "confidence": confidence
            }
        except Exception as e:
            logger.warning(f"Error resolving via geocoder coordinates: {e}")

    # Fallback to default
    return {
        "original": location_name,
        "district": "Bhopal",
        "confidence": 0.50
    }
