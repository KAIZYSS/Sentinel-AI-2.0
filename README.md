# Sentinel AI 🛡️

> **Real-time epidemic signal detection** — combining Google Trends, anonymous user reports, and WHO/IDSP ground truth data into a live geographic outbreak map.

---

## Architecture

```
INPUTS                    AI BRAIN                   SCORING           OUTPUT
─────────────────────     ──────────────────────     ─────────────     ──────────────────
Google Trends (real) ──→  Symptom extractor    ──→   H3 hex score ──→  Mapbox heatmap
User reports (anon)  ──→  Convergence rule     ──→   trends +35%       Timeline player
WHO/IDSP ground truth ──→ Spam filter (IP+dup) ──→   reports +30%      Signal feed
                                                      multi-sym +20%
                                                      spam-clear +15%
```

---

## Running Locally

### Backend (FastAPI — Python)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

Visit: http://localhost:5173

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/report | Submit anonymous health report |
| GET  | /api/signals | All active signals (sorted by confidence) |
| GET  | /api/heatmap | H3 hex confidence data for Mapbox |
| GET  | /api/timeline | 24-hour outbreak progression frames |
| GET  | /api/trends | Live Google Trends keyword scores |
| GET  | /api/groundtruth | WHO/IDSP retrospective anchor data |
| GET  | /api/stats | Dashboard summary metrics |
| GET  | /api/reports/recent | Most recent anonymous reports |

---

## Deployment

### Unified Vercel Deployment

This project is built to deploy entirely on **Vercel** as a single monolithic app. The frontend is hosted as a static Vite site, and the FastAPI backend runs on Vercel Serverless Functions (Python).

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository.
3. Ensure the **Root Directory** is set to `frontend` (where the `vercel.json` is located).
4. Deploy! Vercel will automatically build the React frontend and configure the FastAPI backend in `api/index.py`.

*No separate backend hosting (like Railway) is required.*

---

## Data Sources

| Source | Type | Location |
|--------|------|----------|
| Google Trends (pytrends) | Live / CSV fallback | backend/data/trends_data.csv |
| User Reports (anonymous) | Live in-memory | backend/data/reports_data.csv |
| WHO/IDSP Ground Truth | CSV seed | backend/data/idsp_data.csv |
| Computed Signals | Derived | backend/data/signals_data.csv |

---

## Confidence Formula

confidence = (trends x 0.35) + (reports x 0.30) + (multi-symptom x 0.20) + (spam-clear x 0.15)
           + IDSP anchor boost (up to +10 pts if IDSP confirms outbreak)

A signal is only published if 2 or more independent data sources converge (2-source minimum rule).

---

## Spam Protection

- IP rate limiting: Max 5 reports per IP per hour
- Duplicate detection: Blocks more than 15 identical (district, symptom_set) combinations
- Trust weighting: spam_clear sub-score penalises high-spam districts
