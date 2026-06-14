"""
Sentinel AI — Intelligence Engine
District Snapshot + Gemini 2.5 Flash Analysis + Conversational Intelligence Pipeline.

Flow: Supabase → Snapshot → Gemini → Structured JSON → Frontend
"""

import os
import json
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from collections import defaultdict

try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    genai = None
    types = None
    HAS_GENAI = False

from supabase_client import supabase

# ── GEMINI CLIENT ────────────────────────────────────────────────────────────

_gemini_model = None

def _get_gemini_model():
    """Lazy-init Gemini client."""
    global _gemini_model
    if _gemini_model is not None:
        return _gemini_model
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("WARNING: GEMINI_API_KEY not set. Intelligence analysis will return snapshot-only.")
        return None
    
    if not HAS_GENAI:
        print("WARNING: google-genai not installed. Run: pip install google-genai")
        return None
        
    try:
        client = genai.Client(api_key=api_key)
        _gemini_model = client
        return client
    except Exception as e:
        print(f"WARNING: Gemini init failed: {e}")
        return None


# ── CACHE ────────────────────────────────────────────────────────────────────
# 30-minute TTL per district for intelligence analysis
_intelligence_cache: Dict[str, Dict] = {}
_snapshot_cache: Dict[str, Dict] = {}
INTELLIGENCE_TTL = 1800  # 30 minutes
SNAPSHOT_TTL = 300        # 5 minutes


def _cache_get(cache: dict, key: str, ttl: int) -> Optional[Dict]:
    """Return cached value if within TTL, else None."""
    entry = cache.get(key)
    if entry and (time.time() - entry["_ts"]) < ttl:
        return entry["data"]
    return None


def _cache_set(cache: dict, key: str, data: dict):
    cache[key] = {"data": data, "_ts": time.time()}


# ── DISTRICT SNAPSHOT ENGINE ─────────────────────────────────────────────────

async def generate_district_snapshot(district: str) -> Dict[str, Any]:
    """
    Aggregate data from all 4 Supabase tables for a district.
    Returns a structured snapshot with zero fabricated values.
    """
    # Check cache first
    cached = _cache_get(_snapshot_cache, district, SNAPSHOT_TTL)
    if cached:
        return cached

    if not supabase:
        return _empty_snapshot(district)

    snapshot = {
        "district": district,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report_count": 0,
        "active_diseases": [],
        "dominant_disease": None,
        "emerging_diseases": [],
        "average_trust_score": 0.0,
        "highest_confidence_signal": 0.0,
        "trend_momentum": "stable",
        "convergence_score": 0.0,
        "outbreak_status": "monitoring",
        "recent_activity": [],
        "evidence": {
            "reports": [],
            "signals": [],
            "trends": [],
            "ground_truth": []
        }
    }

    try:
        # ── REPORTS ──────────────────────────────────────────────────────
        reports_resp = supabase.table("reports_data").select("*").eq("district", district).execute()
        reports = reports_resp.data or []
        snapshot["report_count"] = len(reports)

        if reports:
            # Symptom distribution
            symptom_counts = defaultdict(int)
            disease_counts = defaultdict(int)
            trust_sum = 0.0
            
            for r in reports:
                trust_sum += float(r.get("trust_score", 0.5))
                disease = r.get("probable_disease", "Unknown")
                disease_counts[disease] += 1
                tags = r.get("symptom_tags")
                if isinstance(tags, str):
                    tags_list = [t.strip() for t in tags.split("|") if t.strip()]
                elif isinstance(tags, list):
                    tags_list = tags
                else:
                    tags_list = []
                
                if not tags_list:
                    syms = r.get("symptoms") or []
                    if isinstance(syms, str):
                        tags_list = [t.strip() for t in syms.split("|") if t.strip()]
                    elif isinstance(syms, list):
                        tags_list = syms

                for sym in tags_list:
                    if isinstance(sym, str):
                        symptom_counts[sym] += 1

            snapshot["average_trust_score"] = round(trust_sum / len(reports), 3)
            
            # Recent activity (last 10 reports)
            sorted_reports = sorted(reports, key=lambda x: x.get("created_at", ""), reverse=True)
            snapshot["recent_activity"] = [
                {
                    "disease": r.get("probable_disease", "Unknown"),
                    "severity": r.get("severity", "unknown"),
                    "trust_score": r.get("trust_score", 0.5),
                    "timestamp": r.get("created_at", "")
                }
                for r in sorted_reports[:10]
            ]
            
            # Evidence: report summary
            snapshot["evidence"]["reports"] = [
                {
                    "total": len(reports),
                    "disease_distribution": dict(disease_counts),
                    "top_symptoms": dict(sorted(symptom_counts.items(), key=lambda x: -x[1])[:10]),
                    "avg_trust": snapshot["average_trust_score"]
                }
            ]

        # ── SIGNALS ──────────────────────────────────────────────────────
        signals_resp = supabase.table("signals_data").select("*").eq("district", district).execute()
        signals = signals_resp.data or []

        if signals:
            disease_conf = defaultdict(list)
            for s in signals:
                disease = s.get("disease", "Unknown")
                conf = float(s.get("confidence_pct", 0))
                disease_conf[disease].append(conf)

            # Active diseases ranked by avg confidence
            ranked = sorted(
                [(d, sum(cs)/len(cs), len(cs)) for d, cs in disease_conf.items()],
                key=lambda x: -x[1]
            )
            snapshot["active_diseases"] = [
                {"name": d, "avg_confidence": round(c, 1), "signal_count": n}
                for d, c, n in ranked
            ]
            snapshot["dominant_disease"] = ranked[0][0] if ranked else None
            snapshot["highest_confidence_signal"] = round(max(c for cs in disease_conf.values() for c in cs), 1)

            # Emerging: diseases with confidence between 20-50%
            snapshot["emerging_diseases"] = [
                d for d, c, _ in ranked if 20 <= c < 50
            ]

            # Outbreak status
            max_conf = snapshot["highest_confidence_signal"]
            if max_conf >= 80:
                snapshot["outbreak_status"] = "verified_outbreak"
            elif max_conf >= 60:
                snapshot["outbreak_status"] = "high_confidence"
            elif max_conf >= 40:
                snapshot["outbreak_status"] = "elevated"
            elif max_conf > 0:
                snapshot["outbreak_status"] = "emerging"
            
            # Evidence: signal details
            snapshot["evidence"]["signals"] = [
                {
                    "disease": s.get("disease"),
                    "confidence_pct": s.get("confidence_pct"),
                    "h3_hex": s.get("h3_hex"),
                    "date": s.get("date")
                }
                for s in signals[:20]  # Cap at 20 for prompt size
            ]

        # ── TRENDS ───────────────────────────────────────────────────────
        trends_resp = supabase.table("trends_data").select("*").eq("district", district).execute()
        trends = trends_resp.data or []

        if trends:
            avg_score = sum(float(t.get("normalized_score", 0)) for t in trends) / len(trends)
            if avg_score >= 0.6:
                snapshot["trend_momentum"] = "surging"
            elif avg_score >= 0.35:
                snapshot["trend_momentum"] = "rising"
            elif avg_score >= 0.15:
                snapshot["trend_momentum"] = "stable"
            else:
                snapshot["trend_momentum"] = "declining"

            snapshot["evidence"]["trends"] = [
                {
                    "keyword": t.get("keyword"),
                    "disease": t.get("related_disease"),
                    "score": t.get("normalized_score")
                }
                for t in sorted(trends, key=lambda x: -float(x.get("normalized_score", 0)))[:10]
            ]

        # ── GROUND TRUTH ─────────────────────────────────────────────────
        gt_resp = supabase.table("who_idsp_groundtruth").select("*").eq("district", district).execute()
        gt_records = gt_resp.data or []

        if gt_records:
            snapshot["evidence"]["ground_truth"] = [
                {
                    "disease": g.get("disease"),
                    "confirmed_cases": g.get("confirmed_cases", 0),
                    "suspected_cases": g.get("suspected_cases", 0),
                    "deaths": g.get("deaths", 0),
                    "week": g.get("epi_week")
                }
                for g in gt_records[:15]
            ]

        # ── CONVERGENCE SCORE ────────────────────────────────────────────
        # How many independent sources agree on the dominant disease
        sources_agreeing = 0
        dom = snapshot["dominant_disease"]
        if dom:
            if any(dom.lower() in str(r.get("probable_disease", "")).lower() for r in reports):
                sources_agreeing += 1
            if any(dom.lower() in str(t.get("related_disease", "")).lower() for t in trends):
                sources_agreeing += 1
            if any(dom.lower() in str(g.get("disease", "")).lower() for g in gt_records):
                sources_agreeing += 1
            if any(dom.lower() in str(s.get("disease", "")).lower() for s in signals):
                sources_agreeing += 1
        snapshot["convergence_score"] = sources_agreeing / 4.0

    except Exception as e:
        snapshot["error"] = str(e)

    _cache_set(_snapshot_cache, district, snapshot)
    return snapshot


def _empty_snapshot(district: str) -> dict:
    return {
        "district": district,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report_count": 0,
        "active_diseases": [],
        "dominant_disease": None,
        "emerging_diseases": [],
        "average_trust_score": 0.0,
        "highest_confidence_signal": 0.0,
        "trend_momentum": "stable",
        "convergence_score": 0.0,
        "outbreak_status": "monitoring",
        "recent_activity": [],
        "evidence": {"reports": [], "signals": [], "trends": [], "ground_truth": []},
        "error": "Supabase not configured"
    }


# ── GEMINI INTELLIGENCE ANALYSIS ─────────────────────────────────────────────

INTELLIGENCE_SYSTEM_PROMPT = """You are an epidemiologic intelligence analyst for Sentinel AI, a district-level epidemic intelligence platform in India.

RULES:
1. Analyze ONLY the data provided in the district snapshot. Do NOT invent statistics, diseases, or outbreaks.
2. If data is insufficient, explicitly state: "Insufficient evidence available."
3. Every claim must reference specific data from the snapshot.
4. Return ONLY valid JSON. No markdown, no code fences, no commentary outside JSON.
5. Never claim diagnostic certainty. Use intelligence language: "evidence suggests", "data indicates", "signals converge on".

Return JSON with exactly this structure:
{
  "threat_level": "critical|high|elevated|guarded|low",
  "dominant_disease": "string or null",
  "emerging_diseases": ["list of strings"],
  "confidence_level": "high|moderate|low|insufficient",
  "monitoring_required": true/false,
  "situation_summary": "2-3 sentence summary of what is happening in this district",
  "evidence": "Specific data points that support the assessment",
  "disease_drivers": "Which diseases contribute most and why",
  "confidence_assessment": "Why confidence is high or low, referencing signal strengths and source convergence",
  "emerging_risks": "What new patterns are forming, or 'No emerging risks detected'",
  "recommendations": "3-5 specific monitoring recommendations",
  "public_health_observations": "Broader context observations",
  "explainability": {
    "primary_sources": ["list of data sources used"],
    "convergence_factors": ["which sources agree"],
    "uncertainty_factors": ["what data is missing or weak"]
  }
}"""


async def analyze_with_gemini(snapshot: Dict) -> Dict[str, Any]:
    """
    Send district snapshot to Gemini 2.5 Flash for analysis.
    Returns structured intelligence JSON.
    """
    district = snapshot.get("district", "Unknown")
    
    # Check 30-minute cache
    cached = _cache_get(_intelligence_cache, district, INTELLIGENCE_TTL)
    if cached:
        return cached

    client = _get_gemini_model()
    if not client:
        # No Gemini → return computed-only intelligence
        return _fallback_intelligence(snapshot)

    # Build the prompt with the snapshot data
    user_prompt = f"""Analyze this district snapshot for {district}, India.
    
DISTRICT SNAPSHOT:
{json.dumps(snapshot, indent=2, default=str)}

Generate a structured intelligence assessment based ONLY on the data above."""

    try:
        config = types.GenerateContentConfig(
            system_instruction=INTELLIGENCE_SYSTEM_PROMPT,
            temperature=0.1,
            max_output_tokens=4096,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            response_mime_type="application/json"
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=config
        )

        # Parse JSON from response
        raw = response.text.strip()
        # Strip markdown code fences if present (```json or ```)
        if raw.startswith("```"):
            # Remove first line (```json or ```)
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            # Remove closing ```
            if "```" in raw:
                raw = raw[:raw.rfind("```")]
            raw = raw.strip()
        
        # Try to extract JSON object from the response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        
        intelligence = json.loads(raw)
        
        # Validate required fields
        required = ["threat_level", "situation_summary", "evidence", "recommendations"]
        for field in required:
            if field not in intelligence:
                intelligence[field] = "Insufficient evidence available."
        
        # Add metadata
        intelligence["_meta"] = {
            "district": district,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "gemini-2.5-flash",
            "snapshot_report_count": snapshot.get("report_count", 0),
            "cache_ttl_seconds": INTELLIGENCE_TTL
        }

        _cache_set(_intelligence_cache, district, intelligence)
        return intelligence

    except json.JSONDecodeError as e:
        print(f"Gemini returned invalid JSON for {district}: {e}")
        print(f"RAW RESP (length {len(raw)}):\n{raw}\n---")
        fb = _fallback_intelligence(snapshot)
        fb["_meta"]["error"] = f"JSON parse error: {str(e)}"
        return fb
    except Exception as e:
        print(f"Gemini analysis failed for {district}: {e}")
        fb = _fallback_intelligence(snapshot)
        fb["_meta"]["error"] = str(e)
        return fb


def _fallback_intelligence(snapshot: Dict) -> Dict:
    """Compute intelligence from snapshot data without Gemini."""
    district = snapshot.get("district", "Unknown")
    dom = snapshot.get("dominant_disease")
    max_conf = snapshot.get("highest_confidence_signal", 0)
    report_count = snapshot.get("report_count", 0)
    active = snapshot.get("active_diseases", [])
    momentum = snapshot.get("trend_momentum", "stable")
    convergence = snapshot.get("convergence_score", 0)
    
    # Compute threat level
    if max_conf >= 80:
        threat = "critical"
    elif max_conf >= 60:
        threat = "high"
    elif max_conf >= 40:
        threat = "elevated"
    elif max_conf > 0:
        threat = "guarded"
    else:
        threat = "low"

    # Build narrative from data
    if report_count > 0 and dom:
        summary = (
            f"{district} shows {threat}-level epidemiological activity. "
            f"{dom} is the primary disease driver with peak confidence at {max_conf}%. "
            f"{report_count} community reports have been recorded with trend momentum classified as {momentum}."
        )
    elif report_count > 0:
        summary = (
            f"{district} has {report_count} community reports but no dominant disease signal has emerged. "
            f"Activity level is {threat}. Continued monitoring recommended."
        )
    else:
        summary = f"No active data available for {district}. Insufficient evidence for assessment."

    evidence_parts = []
    if report_count > 0:
        evidence_parts.append(f"{report_count} community health reports on file")
    if active:
        evidence_parts.append(f"{len(active)} active disease signal(s): {', '.join(d['name'] for d in active[:3])}")
    gt = snapshot.get("evidence", {}).get("ground_truth", [])
    if gt:
        total_confirmed = sum(g.get("confirmed_cases", 0) for g in gt)
        evidence_parts.append(f"IDSP ground truth confirms {total_confirmed} cases")

    return {
        "threat_level": threat,
        "dominant_disease": dom,
        "emerging_diseases": snapshot.get("emerging_diseases", []),
        "confidence_level": "high" if max_conf >= 70 else "moderate" if max_conf >= 40 else "low" if max_conf > 0 else "insufficient",
        "monitoring_required": max_conf >= 30 or report_count >= 5,
        "situation_summary": summary,
        "evidence": "; ".join(evidence_parts) if evidence_parts else "Insufficient evidence available.",
        "disease_drivers": ", ".join(f"{d['name']} ({d['avg_confidence']}%)" for d in active[:4]) if active else "No active disease drivers detected.",
        "confidence_assessment": f"Peak signal at {max_conf}% with {convergence*100:.0f}% multi-source convergence." if max_conf > 0 else "No signal data available.",
        "emerging_risks": ", ".join(snapshot.get("emerging_diseases", [])) or "No emerging risks detected.",
        "recommendations": f"Monitor {dom} trajectory; track report volume in {district}; verify against IDSP updates." if dom else "Continue routine surveillance.",
        "public_health_observations": f"Trend momentum is {momentum}. Convergence score: {convergence*100:.0f}%.",
        "explainability": {
            "primary_sources": [s for s in ["reports_data", "signals_data", "trends_data", "who_idsp_groundtruth"] if snapshot.get("evidence", {}).get(s.replace("_data","").replace("who_idsp_","ground_"))],
            "convergence_factors": [f"{dom} detected in multiple sources"] if convergence > 0.5 else [],
            "uncertainty_factors": [f"Only {report_count} reports available"] if report_count < 10 else []
        },
        "_meta": {
            "district": district,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "computed-fallback",
            "snapshot_report_count": report_count,
            "cache_ttl_seconds": INTELLIGENCE_TTL
        }
    }


# ── CONVERSATIONAL INTELLIGENCE PIPELINE ─────────────────────────────────────

SYMPTOM_EXTRACTION_PROMPT = """You are a medical symptom extraction engine for Sentinel AI.

RULES:
1. Extract symptoms, duration, severity, and probable diseases from the conversation.
2. Return ONLY valid JSON.
3. Do NOT diagnose. Only extract what the user explicitly mentioned.
4. If no medical information is present, return empty arrays.

Return JSON:
{
  "extracted_symptoms": ["list of symptoms mentioned"],
  "severity": "mild|moderate|severe|unknown",
  "duration": "string description or null",
  "probable_diseases": ["list of possible diseases based on symptoms"],
  "confidence": 0.0-1.0,
  "is_medical_conversation": true/false,
  "key_observations": "brief summary of medical content"
}"""


async def extract_symptoms_from_conversation(
    messages: List[Dict[str, str]], 
    district: str
) -> Dict[str, Any]:
    """
    Extract symptoms from a DoctorAgent conversation.
    Returns structured extraction that can feed into signal generation.
    """
    client = _get_gemini_model()
    if not client:
        return {"error": "Gemini not configured", "is_medical_conversation": False}

    # Build conversation text
    conv_text = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" 
        for m in messages[-10:]  # Last 10 messages
    )

    prompt = f"""District: {district}

CONVERSATION:
{conv_text}

Extract medical symptoms and observations from this conversation."""

    try:
        config = types.GenerateContentConfig(
            system_instruction=SYMPTOM_EXTRACTION_PROMPT,
            temperature=0.1,
            max_output_tokens=1000,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            response_mime_type="application/json"
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=config
        )

        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        extraction = json.loads(raw)
        extraction["district"] = district
        extraction["extracted_at"] = datetime.now(timezone.utc).isoformat()
        return extraction

    except Exception as e:
        return {
            "error": str(e),
            "is_medical_conversation": False,
            "extracted_symptoms": [],
            "district": district
        }


async def generate_conversation_signal(extraction: Dict, district: str) -> Optional[Dict]:
    """
    If a conversation contains valid medical data, generate a signal candidate.
    FastAPI validates before any persistence.
    """
    if not extraction.get("is_medical_conversation", False):
        return None
    
    symptoms = extraction.get("extracted_symptoms", [])
    diseases = extraction.get("probable_diseases", [])
    confidence = float(extraction.get("confidence", 0))
    
    if not symptoms or confidence < 0.3:
        return None

    return {
        "source": "conversation_intelligence",
        "district": district,
        "symptoms": symptoms,
        "probable_diseases": diseases,
        "severity": extraction.get("severity", "unknown"),
        "confidence": confidence,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "requires_validation": True,  # FastAPI must validate before persistence
        "raw_extraction": extraction
    }


# ── INTELLIGENCE REPORT GENERATOR ────────────────────────────────────────────

async def generate_intelligence_report(district: str) -> str:
    """Generate a markdown intelligence report for a district."""
    snapshot = await generate_district_snapshot(district)
    intelligence = await analyze_with_gemini(snapshot)
    
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    dom = intelligence.get("dominant_disease", "None identified")
    threat = intelligence.get("threat_level", "unknown").upper()
    
    recs = intelligence.get('recommendations', 'Continue routine monitoring.')
    if isinstance(recs, list):
        recs_str = "\n".join(f"- {r}" for r in recs)
    else:
        recs_str = str(recs)
        
    report = f"""# Sentinel AI Intelligence Report
## District: {district}
**Generated:** {now}  
**Threat Level:** {threat}  
**Dominant Disease:** {dom}  
**Source:** {intelligence.get('_meta', {}).get('source', 'unknown')}

---

## Situation Summary
{intelligence.get('situation_summary', 'No data available.')}

## Supporting Evidence
{intelligence.get('evidence', 'No evidence available.')}

## Disease Drivers
{intelligence.get('disease_drivers', 'No active drivers.')}

## Confidence Assessment
{intelligence.get('confidence_assessment', 'Unable to assess.')}

## Emerging Risks
{intelligence.get('emerging_risks', 'None detected.')}

## Monitoring Recommendations
{recs_str}

## Public Health Observations
{intelligence.get('public_health_observations', 'No observations.')}

---

## Evidence Trail

### Reports Data
- Total reports: {snapshot.get('report_count', 0)}
- Average trust score: {snapshot.get('average_trust_score', 0):.1%}

### Signal Data
{chr(10).join(f"- {d['name']}: {d['avg_confidence']}% ({d['signal_count']} signals)" for d in snapshot.get('active_diseases', [])) or '- No active signals'}

### Trend Data
- Momentum: {snapshot.get('trend_momentum', 'unknown')}

### IDSP Ground Truth
{chr(10).join(f"- {g['disease']}: {g.get('confirmed_cases', 0)} confirmed, {g.get('deaths', 0)} deaths" for g in snapshot.get('evidence', {}).get('ground_truth', [])) or '- No ground truth records'}

### Convergence Score
{snapshot.get('convergence_score', 0)*100:.0f}% — {"Multi-source agreement detected" if snapshot.get('convergence_score', 0) > 0.5 else "Limited cross-source validation"}

---
*Report generated by Sentinel AI Intelligence Engine. All data sourced from verified databases. This is not a medical diagnosis.*
"""
    return report


# ── HEALTHBOT MVP UPGRADE ────────────────────────────────────────────────────

HEALTHBOT_EXTRACTION_PROMPT = """You are a symptom extraction assistant for Sentinel AI.
Analyze the last 10 messages of the conversation history and extract:
1. "symptoms": a list of canonical symptoms mentioned. Choose from: ["fever", "cough", "body_pain", "headache", "loss_of_appetite", "diarrhea", "vomiting", "fatigue", "chills", "joint_pain", "rash", "loss_of_smell", "shortness_of_breath", "abdominal_pain", "stiff_neck", "seizures", "jaundice", "red_eyes", "runny_nose", "sore_throat", "dehydration", "nausea"].
2. "duration_days": an integer representing the duration of symptoms in days (e.g. "3 days" -> 3, "kal se" / "since yesterday" -> 1, "a week" -> 7). Return 0 or null if not specified.
3. "severity": "mild", "moderate", "severe", or "unknown" based on description.

You must return ONLY a valid JSON object. Do not include markdown fences, code blocks, or any text other than the JSON object.

JSON Schema:
{
  "symptoms": ["list of symptoms"],
  "duration_days": 3,
  "severity": "mild|moderate|severe|unknown"
}"""

HEALTHBOT_CHAT_PROMPT = """You are the HealthBot Epidemiological Assistant for Sentinel AI.
Your goal is to guide the user through symptom collection, explain possible conditions, and offer care guidance.

SYSTEM INSTRUCTIONS:
1. You MUST ONLY discuss the possible disease conditions provided by the Predictor Engine. Do NOT invent other diseases or suggest conditions not in the candidates list.
2. Use the local district intelligence snapshot to mention active/emerging diseases if they match the user's symptoms, but symptoms and predictor results must always remain the primary source of reasoning.
3. Keep the conversation helpful, warm, and professional. Support English, Hindi, Hinglish, and mixed-language chat naturally.
4. If the information gathered is insufficient (the system will indicate this), ask friendly follow-up questions about symptoms, duration, severity, recent travel, exposure to mosquitoes, etc.
5. If the information is sufficient, explain the possible conditions clearly: why they are suggested (supporting symptoms), why other candidates might be less likely (conflicting/missing symptoms), precautions, diet, and monitoring.
6. ALWAYS display the safety disclaimer: "⚠️ This is not a medical diagnosis. Consult a healthcare professional for medical advice." at the end of your message.
7. Return ONLY a valid JSON object matching the requested schema.

JSON SCHEMA:
{
  "response_text": "Your markdown message to the user",
  "explainability": {
    "symptoms_used": ["symptoms used in your explanation"],
    "disease_profile_matches": ["brief notes of symptom matches against the disease profiles"],
    "district_context_used": "brief summary of how local district context (active signals/threats) was taken into account",
    "predictor_reasoning": "brief explanation of why the top predictor matches were selected and how they align with the symptoms"
  }
}"""

STATIC_DISEASE_PROFILES = [
    {
        "disease_name": "Dengue",
        "symptom_1": "fever", "symptom_2": "severe_headache", "symptom_3": "joint_pain", "symptom_4": "rash", "symptom_5": "fatigue"
    },
    {
        "disease_name": "Influenza A",
        "symptom_1": "fever", "symptom_2": "cough", "symptom_3": "body_ache", "symptom_4": "fatigue", "symptom_5": "chills"
    },
    {
        "disease_name": "Malaria",
        "symptom_1": "fever", "symptom_2": "chills", "symptom_3": "sweating", "symptom_4": "body_ache", "symptom_5": "fatigue"
    },
    {
        "disease_name": "COVID-19",
        "symptom_1": "fever", "symptom_2": "cough", "symptom_3": "loss_of_smell", "symptom_4": "shortness_of_breath", "symptom_5": "fatigue"
    },
    {
        "disease_name": "Cholera",
        "symptom_1": "diarrhea", "symptom_2": "vomiting", "symptom_3": "dehydration", "symptom_4": "fatigue", "symptom_5": "nausea"
    },
    {
        "disease_name": "Typhoid",
        "symptom_1": "fever", "symptom_2": "fatigue", "symptom_3": "stomach_pain", "symptom_4": "nausea", "symptom_5": "diarrhea"
    },
    {
        "disease_name": "Rotavirus",
        "symptom_1": "diarrhea", "symptom_2": "vomiting", "symptom_3": "fever", "symptom_4": "abdominal_pain", "symptom_5": "nausea"
    },
    {
        "disease_name": "Tuberculosis",
        "symptom_1": "cough", "symptom_2": "fatigue", "symptom_3": "fever", "symptom_4": "weight_loss", "symptom_5": "night_sweats"
    },
    {
        "disease_name": "Leptospirosis",
        "symptom_1": "fever", "symptom_2": "headache", "symptom_3": "body_ache", "symptom_4": "red_eyes", "symptom_5": "jaundice"
    },
    {
        "disease_name": "Chikungunya",
        "symptom_1": "fever", "symptom_2": "joint_pain", "symptom_3": "body_ache", "symptom_4": "rash", "symptom_5": "fatigue"
    },
    {
        "disease_name": "Measles",
        "symptom_1": "fever", "symptom_2": "cough", "symptom_3": "runny_nose", "symptom_4": "red_eyes", "symptom_5": "rash"
    },
    {
        "disease_name": "Hepatitis A",
        "symptom_1": "fatigue", "symptom_2": "nausea", "symptom_3": "abdominal_pain", "symptom_4": "jaundice", "symptom_5": "fever"
    }
]

async def get_chatbot_response(district: str, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    # 1. Slice messages to last 10
    recent_messages = messages[-10:]
    
    # 2. Lazy init Gemini
    client = _get_gemini_model()
    if not client:
        return {
            "response_text": "I'm sorry, I cannot connect to the intelligence server right now. ⚠️ This is not a medical diagnosis. Consult a healthcare professional for medical advice.",
            "symptom_state": {"symptoms": [], "duration_days": 0, "severity": "unknown"},
            "show_preview": False,
            "preview": None,
            "explainability": {
                "symptoms_used": [],
                "disease_profile_matches": [],
                "district_context_used": "None",
                "predictor_reasoning": "Gemini not configured"
            },
            "predictor_top_match": None
        }

    # ── STEP 1: SYMPTOM EXTRACTION ──
    conv_text = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}"
        for m in recent_messages
    )
    
    extraction_prompt = f"""CONVERSATION:
{conv_text}

Extract symptoms, duration, and severity in JSON format."""

    try:
        config = types.GenerateContentConfig(
            system_instruction=HEALTHBOT_EXTRACTION_PROMPT,
            temperature=0.1,
            max_output_tokens=500,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            response_mime_type="application/json"
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=extraction_prompt,
            config=config
        )
        raw_extraction = response.text.strip()
        # strip code fences
        if raw_extraction.startswith("```"):
            raw_extraction = raw_extraction.split("\n", 1)[1] if "\n" in raw_extraction else raw_extraction[3:]
            if raw_extraction.endswith("```"):
                raw_extraction = raw_extraction[:-3]
            raw_extraction = raw_extraction.strip()
        symptom_state = json.loads(raw_extraction)
    except Exception as e:
        print(f"Chatbot extraction error: {e}")
        # Rule-based fallback extraction
        s_list = ["fever", "cough", "body_pain", "headache", "loss_of_appetite", "diarrhea", "vomiting", "fatigue", "chills", "joint_pain", "rash", "loss_of_smell", "shortness_of_breath", "abdominal_pain", "stiff_neck", "seizures", "jaundice", "red_eyes", "runny_nose", "sore_throat", "dehydration", "nausea"]
        extracted_s = []
        lower_conv = conv_text.lower()
        for sym in s_list:
            match_variants = [sym, sym.replace("_", " "), sym.replace("_", "")]
            if sym == "body_pain":
                match_variants.extend(["body ache", "body_ache", "badan dard", "body pain", "muscle pain", "muscle ache"])
            if sym == "headache":
                match_variants.extend(["sir dard", "head pain", "head ache"])
            if sym == "abdominal_pain":
                match_variants.extend(["stomach pain", "abdominal pain", "pet dard", "stomach_pain", "abdominal_pain"])
            if sym == "vomiting":
                match_variants.extend(["vomit", "nausea", "ulti"])
            if sym == "runny_nose":
                match_variants.extend(["cold", "sneezing", "nose"])
            
            for v in match_variants:
                if v in lower_conv:
                    if sym not in extracted_s:
                        extracted_s.append(sym)
                    break
        
        duration = 0
        import re
        duration_match = re.search(r'(\d+)\s*day', lower_conv)
        if duration_match:
            duration = int(duration_match.group(1))
        elif "yesterday" in lower_conv or "kal se" in lower_conv:
            duration = 1
        elif "week" in lower_conv:
            duration = 7
            
        severity = "unknown"
        if "severe" in lower_conv or "high" in lower_conv or "tezz" in lower_conv:
            severity = "severe"
        elif "moderate" in lower_conv or "medium" in lower_conv:
            severity = "moderate"
        elif "mild" in lower_conv or "low" in lower_conv or "halka" in lower_conv:
            severity = "mild"
            
        symptom_state = {
            "symptoms": extracted_s,
            "duration_days": duration,
            "severity": severity
        }

    # ── STEP 2: PREDICTOR ENGINE ──
    # Fetch profiles
    profiles = []
    if supabase:
        try:
            res = supabase.table("disease_profiles").select("*").execute()
            profiles = res.data or []
        except Exception as e:
            print(f"Supabase disease profiles fetch failed: {e}")
    if not profiles:
        profiles = STATIC_DISEASE_PROFILES

    # Normalize extracted symptoms
    def normalize_tag(tag: str) -> str:
        t = tag.lower().replace("_", " ").strip()
        if t in ["body pain", "body ache", "muscle pain", "muscle ache", "badan dard", "body_pain", "body_ache"]:
            return "body_ache"
        if t in ["severe headache", "headache", "sir dard"]:
            return "severe_headache"
        if t in ["stomach pain", "abdominal pain", "pet dard", "stomach_pain", "abdominal_pain"]:
            return "abdominal_pain"
        if t in ["vomiting", "vomit", "nausea", "ulti"]:
            return "vomiting"
        return t.replace(" ", "_")

    extracted_set = {normalize_tag(s) for s in symptom_state.get("symptoms", [])}
    
    # Get district snapshot for tie-breaking and context
    snapshot = await generate_district_snapshot(district)
    active_diseases_in_district = {d["name"].lower() for d in snapshot.get("active_diseases", [])}

    predictor_candidates = []
    for p in profiles:
        d_name = p.get("disease_name")
        # Collect symptoms from symptom_1 to symptom_5
        disease_syms = set()
        for j in range(1, 6):
            s_val = p.get(f"symptom_{j}")
            if s_val:
                disease_syms.add(normalize_tag(s_val))
        
        matches = extracted_set.intersection(disease_syms)
        match_score = len(matches) / len(disease_syms) if disease_syms else 0.0
        
        if match_score > 0:
            # If scores are equal, prioritize locally active diseases
            is_active_local = 1 if d_name.lower() in active_diseases_in_district else 0
            predictor_candidates.append({
                "disease": d_name,
                "score": round(match_score, 2),
                "is_active_local": is_active_local
            })

    # Sort: matching score DESC, then is_active_local DESC, then name ASC
    predictor_candidates.sort(key=lambda x: (-x["score"], -x["is_active_local"], x["disease"]))

    # Default fallback candidate if no matches
    if not predictor_candidates:
        predictor_candidates = [{"disease": "Influenza A", "score": 0.0, "is_active_local": 0}]

    predictor_top_match = predictor_candidates[0]

    # ── STEP 3: PREVIEW THRESHOLD CHECK ──
    has_2_symptoms = len(symptom_state.get("symptoms", [])) >= 2
    has_duration = (symptom_state.get("duration_days") is not None) and (symptom_state.get("duration_days") > 0)
    has_severity = (symptom_state.get("severity") is not None) and (symptom_state.get("severity") != "unknown")
    
    show_preview = has_2_symptoms or has_duration or has_severity

    preview_data = None
    if show_preview:
        preview_data = {
            "symptoms": symptom_state.get("symptoms", []),
            "severity": symptom_state.get("severity", "moderate") if symptom_state.get("severity") != "unknown" else "moderate",
            "duration_days": symptom_state.get("duration_days", 1) if symptom_state.get("duration_days") else 1,
            "possible_conditions": [c["disease"] for c in predictor_candidates[:2]],
            "confidence_band": "high" if predictor_top_match["score"] >= 0.6 else "medium" if predictor_top_match["score"] >= 0.2 else "low"
        }

    # ── STEP 4: GENERATE CHAT RESPONSE & EXPLANATIONS ──
    chat_prompt = f"""District: {district}
District Snapshot: {json.dumps(snapshot, indent=2, default=str)}
Extracted Symptom State: {json.dumps(symptom_state, indent=2)}
Predictor Top Match: {json.dumps(predictor_top_match, indent=2)}
Predictor Candidates: {json.dumps(predictor_candidates, indent=2)}
Sufficient Information for Preview: {"YES" if show_preview else "NO"}
Conversation History:
{conv_text}

Generate your response in the requested JSON format."""

    try:
        config = types.GenerateContentConfig(
            system_instruction=HEALTHBOT_CHAT_PROMPT,
            temperature=0.2,
            max_output_tokens=1500,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            response_mime_type="application/json"
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=chat_prompt,
            config=config
        )
        raw_chat = response.text.strip()
        if raw_chat.startswith("```"):
            raw_chat = raw_chat.split("\n", 1)[1] if "\n" in raw_chat else raw_chat[3:]
            if raw_chat.endswith("```"):
                raw_chat = raw_chat[:-3]
            raw_chat = raw_chat.strip()
        chat_output = json.loads(raw_chat)
    except Exception as e:
        print(f"Chatbot response generation error: {e}")
        # Rule-based fallback response generation
        disease_names = [c["disease"] for c in predictor_candidates[:2]]
        text = f"I understand you are experiencing symptoms in **{district}**. Based on your description, my rule-based predictor suggests the following possibilities:\n\n"
        for name in disease_names:
            text += f"*   **{name}**: Matches symptoms like *{', '.join(symptom_state.get('symptoms', [])) or 'general malaise'}*.\n"
        text += "\n"
        if not show_preview:
            text += "To help me provide a structured preview and narrow down the possibilities, could you please tell me if you have any other symptoms (like cough, rash, joint pain), or clarify how long you've had them?"
        else:
            text += "Please take appropriate rest, stay hydrated, monitor your temperature, and consult a doctor if your symptoms worsen."
        chat_output = {
            "response_text": text,
            "explainability": {
                "symptoms_used": list(extracted_set) if extracted_set else ["unknown"],
                "disease_profile_matches": [f"{c['disease']}: score {c['score']}" for c in predictor_candidates[:3]],
                "district_context_used": f"District snapshot active for {district}. Active local threat: {', '.join(active_diseases_in_district) if active_diseases_in_district else 'None'}",
                "predictor_reasoning": f"Rule-based fallback: top match is {predictor_top_match['disease']} based on database symptom overlap."
            }
        }

    # Make sure the safety disclaimer is in the response text
    disclaimer = "⚠️ This is not a medical diagnosis. Consult a healthcare professional for medical advice."
    if disclaimer not in chat_output.get("response_text", ""):
        chat_output["response_text"] = chat_output.get("response_text", "").strip() + f"\n\n{disclaimer}"

    return {
        "response_text": chat_output.get("response_text"),
        "symptom_state": symptom_state,
        "show_preview": show_preview,
        "preview": preview_data,
        "explainability": chat_output.get("explainability"),
        "predictor_top_match": predictor_top_match
    }

