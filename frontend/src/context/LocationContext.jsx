import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isMock } from '../lib/supabase';

const LocationContext = createContext();

// Comprehensive district list matching the Heatmap DISTRICT_COORDS
const FALLBACK_DISTRICTS = [
  'Ahmedabad', 'Alappuzha', 'Amravati', 'Amritsar', 'Asansol',
  'Aurangabad', 'Ballari', 'Bardhaman', 'Bathinda', 'Belagavi',
  'Bengaluru', 'Bengaluru Urban', 'Bhavnagar', 'Bhopal', 'Chennai', 'Chengalpattu', 'Coimbatore',
  'Davanagere', 'Delhi Central', 'Delhi East', 'Delhi North', 'Delhi South', 'Delhi West',
  'Durgapur', 'Erode', 'Gandhinagar', 'Gwalior', 'Howrah',
  'Hubballi', 'Hyderabad', 'Indore', 'Jabalpur', 'Jalandhar',
  'Jamnagar', 'Junagadh', 'Kalaburagi', 'Kannur', 'Karimnagar',
  'Khammam', 'Kochi', 'Kolhapur', 'Kolkata', 'Kozhikode',
  'Ludhiana', 'Madurai', 'Mahbubnagar', 'Malappuram', 'Mangaluru',
  'Mohali', 'Mumbai', 'Mysuru', 'Nagpur', 'Nanded',
  'Nashik', 'New Delhi', 'Nizamabad', 'Palakkad', 'Patiala',
  'Pune', 'Rajkot', 'Rewa', 'Sagar MP', 'Salem',
  'Satna', 'Shivamogga', 'Siliguri', 'Solapur', 'Surat',
  'Thane', 'Thanjavur', 'Thiruvananthapuram', 'Thrissur',
  'Tiruchirappalli', 'Tirunelveli', 'Ujjain', 'Vadodara',
  'Vellore', 'Warangal'
];

const getInitialData = () => {
  try {
    const cached = localStorage.getItem('sentinel_location_data');
    if (cached) {
      const parsed = JSON.parse(cached);
      // We load the cached value, but useEffect will decide whether to refresh it
      return parsed;
    }
  } catch (e) {
    console.error("Error parsing cached location data:", e);
  }
  return {
    district: 'Bhopal',
    state: 'Madhya Pradesh',
    locationSource: 'default',
    detectedAt: 0,
    detectedState: null,
    matchConfidence: 1.0
  };
};

export function LocationProvider({ children }) {
  const initial = getInitialData();
  const [district, setDistrictState] = useState(initial.district);
  const [locationSource, setLocationSource] = useState(initial.locationSource);
  const [detectedState, setDetectedState] = useState(initial.state || null);
  const [matchConfidence, setMatchConfidence] = useState(initial.matchConfidence || 1.0);
  const [availableDistricts, setAvailableDistricts] = useState(FALLBACK_DISTRICTS);
  
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [locationMsg, setLocationMsg] = useState(null);

  const setDistrict = (newDist, source = 'manual', stateName = null, confidence = 1.0) => {
    setDistrictState(newDist);
    setLocationSource(source);
    setDetectedState(stateName);
    setMatchConfidence(confidence);
    if (source !== 'auto') {
      setLocationMsg(null);
    }

    try {
      const meta = {
        district: newDist,
        state: stateName || (source === 'manual' ? null : detectedState),
        locationSource: source,
        detectedAt: Date.now(),
        matchConfidence: confidence
      };
      localStorage.setItem('sentinel_location_data', JSON.stringify(meta));
    } catch (e) {
      console.error("Error saving location data to cache:", e);
    }
  };

  const mapToSentinelDistrict = (detectedDistrict, detectedCity, detectedState, list) => {
    if (!detectedDistrict && !detectedCity) return null;
    
    const cleanName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const candidates = [detectedCity, detectedDistrict].filter(Boolean);
    
    // Remove common district suffixes for cleaner matching
    const stripSuffixes = (str) => {
      return str.toLowerCase()
        .replace(/\b(district|corporation|municipal|municipality|city|north|south|east|west|central)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    };

    // Standard mappings
    const overrides = {
      'delhi': 'New Delhi',
      'bangalore': 'Bengaluru',
      'bombay': 'Mumbai',
      'madras': 'Chennai',
      'calcutta': 'Kolkata',
      'trivandrum': 'Thiruvananthapuram',
      'vizag': 'Visakhapatnam',
      'visakhapatnam': 'Visakhapatnam',
      'gurgaon': 'Gurugram',
      'pondicherry': 'Puducherry'
    };

    for (const cand of candidates) {
      const candLower = cand.toLowerCase();
      for (const key in overrides) {
        if (candLower.includes(key)) {
          return { district: overrides[key], confidence: 0.95 };
        }
      }
    }

    // 1. Try exact match in the district list
    for (const cand of candidates) {
      const candClean = cleanName(cand);
      const exactMatch = list.find(d => cleanName(d) === candClean);
      if (exactMatch) {
        return { district: exactMatch, confidence: 1.0 };
      }
    }

    // 2. Try normalized substring matching
    for (const cand of candidates) {
      const strippedCand = stripSuffixes(cand);
      if (!strippedCand) continue;
      
      const bestMatch = list.find(d => {
        const strippedD = stripSuffixes(d);
        return strippedD && (strippedD.includes(strippedCand) || strippedCand.includes(strippedD));
      });
      
      if (bestMatch) {
        return { district: bestMatch, confidence: 0.90 };
      }
    }

    return null;
  };

  const detectUserLocation = (currentList) => {
    const list = currentList || availableDistricts;
    
    // Check for mocked coordinates in URL to support automated testing/verification
    const params = new URLSearchParams(window.location.search);
    const mockLat = params.get('mock_lat') || params.get('lat');
    const mockLon = params.get('mock_lon') || params.get('lng');

    if (mockLat && mockLon) {
      setGeoLoading(true);
      setGeoError(null);
      (async () => {
        try {
          const lat = parseFloat(mockLat);
          const lon = parseFloat(mockLon);
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
            headers: {
              'User-Agent': 'SentinelAI-Location-Resolver/2.0'
            }
          });
          if (!res.ok) throw new Error('Nominatim reverse geocoding request failed.');
          
          const data = await res.json();
          const addr = data.address || {};
          const detectedCity = addr.city || addr.town || addr.village || addr.suburb || addr.municipality;
          const detectedDistrict = addr.county || addr.district || addr.state_district;
          const detectedState = addr.state;
          const locality = detectedCity || detectedDistrict || 'Unknown location';

          const apiBase = (import.meta.env.VITE_API_BASE || '') + '/api';
          const resolveRes = await fetch(`${apiBase}/resolve-location?q=${encodeURIComponent(locality)}`);
          
          if (resolveRes.ok) {
            const resolved = await resolveRes.json();
            if (resolved && resolved.district) {
              setDistrict(resolved.district, 'auto', detectedState, resolved.confidence);
              if (resolved.original.toLowerCase() !== resolved.district.toLowerCase()) {
                setLocationMsg({
                  detected: resolved.original,
                  mapped: resolved.district
                });
                setGeoError(null);
              } else {
                setLocationMsg(null);
                setGeoError(null);
              }
              if (resolved.confidence < 0.70) {
                setGeoError('Detected district may be inaccurate. Please verify.');
              }
            } else {
              setGeoError(`Resolved "${locality}", but it could not be mapped to a surveillance district. Using default district.`);
              setDistrict('Bhopal', 'default', 'Madhya Pradesh', 0.5);
              setLocationMsg(null);
            }
          } else {
            throw new Error('Backend resolution failed');
          }
        } catch (e) {
          console.error("Mock location resolution error:", e);
          setGeoError('Unable to determine location. Using fallback district.');
          setDistrict('Bhopal', 'default', 'Madhya Pradesh', 0.5);
          setLocationMsg(null);
        } finally {
          setGeoLoading(false);
        }
      })();
      return;
    }

    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      setLocationSource('default');
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Privacy constraint: coordinates must ONLY be used for reverse geocoding
        // DO NOT store coordinates in state or localStorage. Only store district and state.
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, {
            headers: {
              'User-Agent': 'SentinelAI-Location-Resolver/2.0'
            }
          });
          
          if (!res.ok) {
            throw new Error('Nominatim reverse geocoding request failed.');
          }
          
          const data = await res.json();
          const addr = data.address || {};
          const detectedCity = addr.city || addr.town || addr.village || addr.suburb || addr.municipality;
          const detectedDistrict = addr.county || addr.district || addr.state_district;
          const detectedState = addr.state;
          const locality = detectedCity || detectedDistrict || 'Unknown location';

          // Call backend resolve-location API
          const apiBase = (import.meta.env.VITE_API_BASE || '') + '/api';
          const resolveRes = await fetch(`${apiBase}/resolve-location?q=${encodeURIComponent(locality)}`);
          
          if (resolveRes.ok) {
            const resolved = await resolveRes.json();
            if (resolved && resolved.district) {
              setDistrict(resolved.district, 'auto', detectedState, resolved.confidence);
              
              // If it's a mapping override (not exact case-insensitive match)
              if (resolved.original.toLowerCase() !== resolved.district.toLowerCase()) {
                setLocationMsg({
                  detected: resolved.original,
                  mapped: resolved.district
                });
                setGeoError(null);
              } else {
                setLocationMsg(null);
                setGeoError(null);
              }
              
              if (resolved.confidence < 0.70) {
                setGeoError('Detected district may be inaccurate. Please verify.');
              }
            } else {
              setGeoError(`Resolved "${locality}", but it could not be mapped to a surveillance district. Using default district.`);
              setDistrict('Bhopal', 'default', 'Madhya Pradesh', 0.5);
              setLocationMsg(null);
            }
          } else {
            throw new Error('Backend resolve-location returned error status.');
          }
        } catch (err) {
          console.error('Location resolution error:', err);
          setGeoError('Unable to determine location. Using fallback district.');
          setDistrict('Bhopal', 'default', 'Madhya Pradesh', 0.5);
          setLocationMsg(null);
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        let msg = 'Unable to determine location. Using fallback district.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location access denied. Using default district.';
        }
        setGeoError(msg);
        setGeoLoading(false);
        setDistrict('Bhopal', 'default', 'Madhya Pradesh', 0.5);
      },
      { timeout: 8000 }
    );
  };

  useEffect(() => {
    // Only query Supabase when real credentials are available
    const fetchDistricts = async () => {
      let unique = FALLBACK_DISTRICTS;
      try {
        if (!isMock) {
          const { data, error } = await supabase
            .from('reports_data')
            .select('district')
            .limit(1000);
            
          if (!error && data) {
            const list = [...new Set(data.map(r => r.district))].filter(Boolean).sort();
            if (list.length > 0) {
              unique = list;
              setAvailableDistricts(unique);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching districts, using fallback list:", err);
      }

      // Check if saved preferences exist
      try {
        const cached = localStorage.getItem('sentinel_location_data');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.locationSource === 'manual') {
            // Manual selection always wins and never expires
            setDistrictState(parsed.district);
            setLocationSource('manual');
            setDetectedState(parsed.state);
            setMatchConfidence(parsed.matchConfidence || 1.0);
            return;
          }
          
          const ageHours = (Date.now() - (parsed.detectedAt || 0)) / (1000 * 60 * 60);
          if (parsed.locationSource === 'auto' && ageHours < 24) {
            // Valid auto-detected cache
            setDistrictState(parsed.district);
            setLocationSource('auto');
            setDetectedState(parsed.state);
            setMatchConfidence(parsed.matchConfidence || 1.0);
            return;
          }
        }
      } catch (e) {
        console.error("Error loading cached location at startup:", e);
      }

      // No saved manual select OR cached auto-select is > 24 hours old: run geolocation detection
      detectUserLocation(unique);
    };

    fetchDistricts();
  }, []);

  return (
    <LocationContext.Provider value={{
      district,
      setDistrict,
      availableDistricts,
      locationSource,
      geoLoading,
      geoError,
      setGeoError,
      detectedState,
      matchConfidence,
      detectUserLocation,
      locationMsg,
      setLocationMsg
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}


