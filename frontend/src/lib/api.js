import { supabase, isMock } from './supabase';

// In dev: Vite proxy forwards /api → localhost:8000
// In prod: VITE_API_BASE points to the Railway backend URL
const BASE = (import.meta.env.VITE_API_BASE || '') + '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  /** Submit an anonymous report via FastAPI to preserve NLP and logic */
  submitReport: (district, symptoms, freeText = '') =>
    apiFetch('/report', {
      method: 'POST',
      body: JSON.stringify({ district, symptoms, free_text: freeText }),
    }),

  /** Get all signals from Supabase */
  getSignals: async (district = null) => {
    if (isMock) {
      const loc = district || 'New Delhi';
      // Deterministic seed from district name so data is stable per district
      const seed = loc.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const pool = ['Nipah Virus', 'Cholera', 'Dengue', 'Malaria', 'Typhoid', 'COVID-19', 'Chikungunya', 'Leptospirosis', 'Hepatitis A'];
      const count = 3 + (seed % 4); // 3-6 signals per district

      return Array.from({ length: count }).map((_, i) => {
        const disease = pool[(seed + i * 7) % pool.length];
        const confidence = 25 + ((seed * (i + 1) * 13) % 65); // 25-89, deterministic
        const reportCount = 3 + ((seed * (i + 1)) % 30);
        return {
          id: `sig-${loc.replace(/\s/g, '')}-${i}`,
          name: `${disease} · ${loc}`,
          district: loc,
          confidence,
          status: confidence >= 80 ? 'strong' : confidence >= 40 ? 'emerging' : 'noise',
          report_count: reportCount,
          sources: ['user reports', 'trend signals'],
          symptoms: [disease.toLowerCase(), 'fever'],
          created_at: new Date(Date.now() - (i * 3600000)).toISOString(),
          last_updated: new Date(Date.now() - (i * 1800000)).toISOString(),
          h3_hex: `873e8${String(seed % 10000).padStart(4, '0')}ffffff`
        };
      });
    }
    let query = supabase.from('signals_data').select('*');
    if (district) query = query.eq('district', district);
    const { data, error } = await query;
    if (error) throw error;
    // Map to the expected format
    return data.map(s => ({
      id: s.district + s.h3_hex, // composite fake id
      name: s.disease + ' · ' + s.district,
      district: s.district,
      confidence: s.confidence_pct,
      status: s.confidence_pct >= 80 ? 'strong' : s.confidence_pct >= 40 ? 'emerging' : 'noise',
      report_count: Math.round(s.reports_score * 100), // proxy
      sources: ['user reports', 'trend signals'],
      symptoms: [s.disease], // proxy
      created_at: s.date,
      last_updated: s.date,
      h3_hex: s.h3_hex
    }));
  },

  /** Get heatmap data by adapting signals_data */
  getHeatmap: async (district = null) => {
    if (isMock) {
      const loc = district || 'New Delhi';
      const seed = loc.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const pool = ['Dengue', 'Malaria', 'Typhoid', 'COVID-19', 'Cholera', 'Chikungunya', 'Leptospirosis', 'Hepatitis A'];
      const count = 4 + (seed % 6);

      // Use dynamic import for h3-js to generate valid hex IDs from district coords
      try {
        const h3 = await import('h3-js');
        // District coordinate lookup (subset matching Heatmap.jsx DISTRICT_COORDS)
        const COORDS = {
          "Bhopal": [23.2599, 77.4126], "Indore": [22.7196, 75.8577], "Gwalior": [26.2183, 78.1828],
          "Mumbai": [19.076, 72.8777], "Pune": [18.5204, 73.8567], "Chennai": [13.0827, 80.2707],
          "Bengaluru": [12.9716, 77.5946], "Hyderabad": [17.385, 78.4867], "Kolkata": [22.5726, 88.3639],
          "New Delhi": [28.6139, 77.209], "Ahmedabad": [23.0225, 72.5714], "Surat": [21.1702, 72.8311],
          "Nagpur": [21.1458, 79.0882], "Coimbatore": [11.0168, 76.9558], "Madurai": [9.9252, 78.1198],
          "Kochi": [9.9312, 76.2673], "Ludhiana": [30.901, 75.8573], "Mysuru": [12.2958, 76.6394],
          "Ujjain": [23.1828, 75.7772], "Jabalpur": [23.1815, 79.9864], "Nashik": [19.9975, 73.7898],
          "Thane": [19.2183, 72.9781], "Rajkot": [22.3039, 70.8022], "Vadodara": [22.3072, 73.1812],
        };
        const base = COORDS[loc] || [20.5 + (seed % 10), 75 + (seed % 8)];

        return Array.from({ length: count }).map((_, i) => {
          const lat = base[0] + (i * 0.025 - count * 0.0125);
          const lng = base[1] + ((i % 3) * 0.03 - 0.03);
          return {
            hex_id: h3.latLngToCell(lat, lng, 7),
            district: loc,
            confidence: 15 + ((seed * (i + 1) * 11) % 75),
            report_count: 2 + ((seed * (i + 1)) % 20),
            dominant_symptom: pool[(seed + i * 5) % pool.length]
          };
        });
      } catch (e) {
        // Fallback if h3-js fails to load
        return Array.from({ length: count }).map((_, i) => ({
          hex_id: `873e8${String((seed + i * 3) % 10000).padStart(4, '0')}ffffff`,
          district: loc,
          confidence: 15 + ((seed * (i + 1) * 11) % 75),
          report_count: 2 + ((seed * (i + 1)) % 20),
          dominant_symptom: pool[(seed + i * 5) % pool.length]
        }));
      }
    }
    let query = supabase.from('signals_data').select('*');
    if (district) query = query.eq('district', district);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(s => ({
      hex_id: s.h3_hex,
      district: s.district,
      confidence: s.confidence_pct,
      report_count: Math.round((s.reports_score || 0) * 100),
      dominant_symptom: s.disease
    }));
  },

  /** Get timeline data for outbreak playback - still handled by backend */
  getTimeline: () => apiFetch('/timeline'),

  /** Get dashboard stats */
  getStats: async () => {
    if (isMock) {
      return {
        active_signals: 2, genuine_count: 2, noise_count: 0,
        total_reports_24h: 17, spam_blocked: 0, top_confidence: 85,
        alert_triggered: true, trends_score: 85
      };
    }
    const { count: reportCount } = await supabase.from('reports_data').select('*', { count: 'exact', head: true });
    const { data: signals } = await supabase.from('signals_data').select('*');

    const active_signals = signals?.length || 0;
    const genuine_count = signals?.filter(s => s.confidence_pct >= 20).length || 0;
    const noise_count = active_signals - genuine_count;
    const top_confidence = signals?.reduce((max, s) => Math.max(max, s.confidence_pct), 0) || 0;

    return {
      active_signals,
      genuine_count,
      noise_count,
      total_reports_24h: reportCount || 0,
      spam_blocked: 0,
      top_confidence,
      alert_triggered: top_confidence >= 80,
      trends_score: 85
    };
  },

  /** Get recent anonymous reports from Supabase */
  getRecentReports: async (limit = 20, district = null) => {
    if (isMock) {
      const loc = district || 'New Delhi';
      const seed = loc.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const diseasePool = [
        { name: 'Dengue', symptoms: ['fever', 'joint pain', 'rash'], severity: 'severe' },
        { name: 'Cholera', symptoms: ['diarrhea', 'vomiting', 'dehydration'], severity: 'severe' },
        { name: 'Malaria', symptoms: ['fever', 'chills', 'sweat'], severity: 'moderate' },
        { name: 'Typhoid', symptoms: ['fever', 'stomach pain', 'weakness'], severity: 'moderate' },
        { name: 'COVID-19', symptoms: ['cough', 'fever', 'loss of smell'], severity: 'severe' },
        { name: 'Chikungunya', symptoms: ['fever', 'joint pain', 'fatigue'], severity: 'moderate' },
        { name: 'Hepatitis A', symptoms: ['fatigue', 'jaundice', 'stomach pain'], severity: 'severe' },
        { name: 'Common Cold', symptoms: ['runny nose', 'sneezing', 'mild cough'], severity: 'mild' },
        { name: 'Leptospirosis', symptoms: ['fever', 'muscle pain', 'jaundice'], severity: 'severe' },
        { name: 'Nipah Virus', symptoms: ['fever', 'headache', 'confusion'], severity: 'severe' }
      ];

      // Deterministic: pick 3-4 dominant diseases per district
      const dominantIndices = [seed % diseasePool.length, (seed * 3) % diseasePool.length, (seed * 7) % diseasePool.length, (seed * 11) % diseasePool.length];
      const reportCount = 12 + (seed % 12);

      const stateMap = { 'Bhopal': 'Madhya Pradesh', 'Indore': 'Madhya Pradesh', 'Mumbai': 'Maharashtra', 'Pune': 'Maharashtra', 'Chennai': 'Tamil Nadu', 'Bengaluru': 'Karnataka', 'Hyderabad': 'Telangana', 'Kolkata': 'West Bengal', 'New Delhi': 'Delhi', 'Ahmedabad': 'Gujarat' };
      const state = stateMap[loc] || 'India';

      return Array.from({ length: reportCount }).map((_, i) => {
        const d = diseasePool[dominantIndices[i % dominantIndices.length]];
        const trustBase = 0.35 + ((seed * (i + 1) * 7) % 60) / 100;
        return {
          anon_id: `RPT-${String(seed).slice(0, 2)}${String(i).padStart(3, '0')}`,
          district: loc,
          state,
          hex_id: `873e8${String((seed + i) % 10000).padStart(4, '0')}ffffff`,
          h3_hex: `873e8${String((seed + i) % 10000).padStart(4, '0')}ffffff`,
          lat: 20 + (seed % 10) + (i * 0.01),
          lon: 75 + (seed % 8) + (i * 0.01),
          symptoms: d.symptoms,
          timestamp: new Date(Date.now() - (i * 2700000 + seed * 1000)).toISOString(),
          severity: d.severity,
          duration: `${1 + (i % 5)} days`,
          trust_score: Math.min(trustBase, 0.95),
          probable_disease: d.name
        };
      });
    }
    let query = supabase
      .from('reports_data')
      .select('*')
      .order('date', { ascending: false })
      .order('hour', { ascending: false })
      .limit(limit);

    if (district) {
      query = query.eq('district', district);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data.map(r => {
      // hour is stored as "HH:MM" (e.g. "16:00"), so build a proper ISO timestamp
      const hourPart = r.hour || '00:00';
      const isoTimestamp = `${r.date}T${hourPart}:00Z`;
      return {
        anon_id: r.report_id,
        district: r.district,
        state: r.state || 'India',
        hex_id: r.h3_hex,
        h3_hex: r.h3_hex,
        lat: r.lat,
        lon: r.lon,
        symptoms: r.symptom_tags ? r.symptom_tags.split('|') : [],
        timestamp: isoTimestamp,
        severity: r.severity || 'moderate',
        duration: r.duration || '1-3 days',
        trust_score: r.trust_score ?? 0.5,
        probable_disease: r.probable_disease || 'Unknown'
      };
    });
  },

  /** Get 6-hour hex-level outbreak predictions */
  getPredictions: () => apiFetch('/predictions'),

  /** Get overall outbreak trajectory forecast */
  getForecast: () => apiFetch('/forecast'),

  /** Get live Google Trends scores from Supabase */
  getTrends: async (district = null) => {
    if (isMock) {
      const allMocks = [
        { id: 1, keyword: 'fever symptoms', related_disease: 'Viral', normalized_score: 0.85, district: 'Bhopal' },
        { id: 2, keyword: 'fever symptoms', related_disease: 'Viral', normalized_score: 0.65, district: 'New Delhi' },
        { id: 3, keyword: 'fever symptoms', related_disease: 'Viral', normalized_score: 0.45, district: 'Mumbai' },
        { id: 4, keyword: 'malaria treatment', related_disease: 'Malaria', normalized_score: 0.70, district: 'Mumbai' },
        { id: 5, keyword: 'dengue test near me', related_disease: 'Dengue', normalized_score: 0.90, district: 'Bhopal' },
        { id: 6, keyword: 'dengue test near me', related_disease: 'Dengue', normalized_score: 0.80, district: 'New Delhi' }
      ];

      let filtered = allMocks;
      if (district) {
        filtered = allMocks.filter(m => m.district === district);
      }

      const avgScore = filtered.length
        ? Math.round(filtered.reduce((sum, item) => sum + (item.normalized_score * 100), 0) / filtered.length)
        : 50;

      return {
        trends_score: avgScore,
        keywords: filtered,
        geo: district || "India",
        source: "Mock Data (Connect backend for Live Google Trends)"
      };
    }
    let query = supabase.from('trends_data').select('*');
    if (district) {
      query = query.eq('district', district);
    }
    const { data, error } = await query.limit(100);
    if (error) throw error;

    // Calculate aggregate score
    const avgScore = data.length
      ? Math.round(data.reduce((sum, item) => sum + (item.normalized_score * 100), 0) / data.length)
      : 0;

    return {
      trends_score: avgScore || 50,
      keywords: data,
      geo: district || "India",
      source: "Supabase Trends Data"
    };
  },

  /** Get WHO/IDSP ground truth data from Supabase */
  getGroundTruth: async (district = null) => {
    if (isMock) return { idsp_records: [], source: "Mock IDSP Data", coverage: district || "All Districts" };
    let query = supabase.from('who_idsp_groundtruth').select('*');
    if (district) query = query.eq('district', district);
    const { data, error } = await query;
    if (error) throw error;

    return {
      idsp_records: data,
      source: "IDSP via Supabase",
      coverage: district || "All Districts"
    };
  },

  /** Get disease profiles */
  getDiseaseProfiles: async () => {
    if (isMock) return [{ name: 'Dengue', current_threat_level: 8, severity: 7 }];
    const { data, error } = await supabase.from('disease_profiles').select('*');
    if (error) throw error;
    return data;
  },

  // ── INTELLIGENCE LAYER (Gemini 2.5 Flash) ─────────────────────────────

  /** Get Gemini-analyzed intelligence for a district (30min cache) */
  getIntelligence: (district) => apiFetch(`/intelligence/${encodeURIComponent(district)}`),

  /** Get raw district snapshot — fast, no Gemini (5min cache) */
  getSnapshot: (district) => apiFetch(`/snapshot/${encodeURIComponent(district)}`),

  /** Get full markdown intelligence report */
  getIntelligenceReport: (district) => apiFetch(`/report/${encodeURIComponent(district)}`),

  /** Conversational intelligence: extract symptoms → generate signal */
  analyzeConversation: (district, messages) =>
    apiFetch('/conversation/analyze', {
      method: 'POST',
      body: JSON.stringify({ district, messages }),
    }),

  /** HealthBot MVP Chat endpoint */
  chatHealthBot: (district, messages) =>
    apiFetch('/chatbot/chat', {
      method: 'POST',
      body: JSON.stringify({ district, messages }),
    }),
};
