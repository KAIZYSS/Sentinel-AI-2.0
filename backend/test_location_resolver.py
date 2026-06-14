"""
Test script for location resolver.
"""
import sys
import os

sys.path.append(os.path.dirname(__file__))

from location_resolver import resolve_location

def run_tests():
    tests = [
        # 1. Exact match
        {"input": "Ranchi", "expected_district": "Ranchi", "min_confidence": 1.0},
        {"input": "Chennai", "expected_district": "Chennai", "min_confidence": 1.0},
        # 2. Known locality mapping
        {"input": "Keezhakottaiyur", "expected_district": "Chengalpattu", "min_confidence": 0.98},
        {"input": "Siruseri", "expected_district": "Chengalpattu", "min_confidence": 0.98},
        {"input": "Navalur", "expected_district": "Chengalpattu", "min_confidence": 0.98},
        {"input": "Whitefield", "expected_district": "Bengaluru Urban", "min_confidence": 0.98},
        # 3. Fuzzy matching
        {"input": "Sholingnallur", "expected_district": "Chennai", "min_confidence": 0.70},
        # 4. Geocoder lookup / nearest neighbor
        {"input": "Electronic City", "expected_district": "Bengaluru Urban", "min_confidence": 0.70},
    ]

    print("Running Location Normalization Layer tests...")
    all_passed = True
    
    for t in tests:
        res = resolve_location(t["input"])
        print(f"\nInput: '{t['input']}'")
        print(f"Result: {res}")
        
        passed = True
        if res["district"] != t["expected_district"]:
            print(f"❌ FAILED: Expected district '{t['expected_district']}', got '{res['district']}'")
            passed = False
        if res["confidence"] < t["min_confidence"]:
            print(f"❌ FAILED: Expected min confidence {t['min_confidence']}, got {res['confidence']}")
            passed = False
            
        if passed:
            print("[PASS]")
        else:
            all_passed = False
            
    if all_passed:
        print("\nALL TESTS PASSED SUCCESSFULLY!")
    else:
        print("\nSOME TESTS FAILED!")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
