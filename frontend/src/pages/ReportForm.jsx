import { useState, useMemo } from 'react'
import { api } from '../lib/api'
import { useLocation } from '../context/LocationContext'

const SYMPTOMS = [
  'Cough', 'Fever', 'Fatigue', 'Loss of smell',
  'Headache', 'Sore throat', 'Shortness of breath',
  'Body ache', 'Nausea', 'Rash', 'Joint pain',
  'Diarrhea', 'Chills', 'Muscle pain', 'Red eyes'
]

function genAnonId() {
  return Math.random().toString(16).slice(2, 10).toUpperCase()
}

export default function ReportForm({ onClose }) {
  const { availableDistricts } = useLocation()
  const [district, setDistrict]     = useState('')
  const [symptoms, setSymptoms]     = useState([])
  const [freeText, setFreeText]     = useState('')
  const [severity, setSeverity]     = useState('moderate')
  const [duration, setDuration]     = useState('1-3 days')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)
  const anonId = useMemo(genAnonId, [])

  const toggleSymptom = (s) =>
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  // Live confidence contribution preview
  const confPreview = Math.min(symptoms.length * 8 + (district ? 5 : 0) + (freeText.length > 20 ? 4 : 0), 35)

  const handleSubmit = async () => {
    if (!district || symptoms.length === 0) {
      setError('Please select a district and at least one symptom.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // The API submits report via FastAPI
      const r = await api.submitReport(district, symptoms.map(s => s.toLowerCase()), freeText)
      setResult(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setDistrict(''); setSymptoms([]); setFreeText(''); setSeverity('moderate'); setDuration('1-3 days'); setResult(null); setError(null)
  }

  return (
    <div className="animate-in" style={{ background: 'var(--bg2)', borderRadius: 12, padding: '8px 4px' }}>
      {result ? (
        <SuccessScreen result={result} onReset={reset} onClose={onClose} />
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
            Your observations help detect emerging health patterns. No personal data is stored — only anonymous signals fed into the AI confidence engine.
          </p>

          {/* Anon badge */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, background: 'rgba(212, 175, 55, 0.05)', border: '1px solid rgba(212, 175, 55, 0.15)', borderRadius: 8, marginBottom: 20 }}>
            <i className="ti ti-shield-check" style={{ color: 'var(--gold)', fontSize: 20, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              You are anonymous. We store: timestamp, district, symptoms, free-text — no name, no IP, no identity.
              Your session ID: <strong style={{ color: 'var(--gold)' }}>#{anonId}</strong>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
              <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{error}
            </div>
          )}

          {/* District */}
          <FormGroup label="District / Area *">
            <select value={district} onChange={e => setDistrict(e.target.value)} style={inputStyle}>
              <option value="">Select district...</option>
              {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </FormGroup>

          {/* Severity & Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
            <FormGroup label="Severity">
              <select value={severity} onChange={e => setSeverity(e.target.value)} style={inputStyle}>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </FormGroup>
            <FormGroup label="Duration">
              <select value={duration} onChange={e => setDuration(e.target.value)} style={inputStyle}>
                <option value="1-3 days">1-3 days</option>
                <option value="4-7 days">4-7 days</option>
                <option value=">7 days">&gt;7 days</option>
              </select>
            </FormGroup>
          </div>

          {/* Symptoms */}
          <FormGroup label="Symptoms observed * (select all that apply)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {SYMPTOMS.map(s => {
                const isSelected = symptoms.includes(s)
                return (
                  <div key={s}
                    onClick={() => toggleSymptom(s)}
                    style={{
                      padding: '8px 10px',
                      background: isSelected ? 'rgba(212, 175, 55, 0.15)' : 'var(--bg3)',
                      border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: 8,
                      fontSize: 12,
                      color: isSelected ? 'var(--gold)' : 'var(--text2)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all .15s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--border2)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    {s}
                  </div>
                )
              })}
            </div>
          </FormGroup>

          {/* Free text */}
          <FormGroup label="Your observation (optional — in your own words)">
            <textarea
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              placeholder="e.g. Several people in my colony have been feeling unwell this week with joint pain..."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            />
          </FormGroup>

          {/* Live confidence preview */}
          <div style={{ background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)', padding: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
              <span>Estimated contribution to signal confidence</span>
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>+{confPreview}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--gold)', width: confPreview + '%', transition: 'width .5s' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
              More symptoms + free text = stronger signal contribution
            </div>
          </div>

          {/* Buttons Row */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: 12,
                background: 'transparent',
                color: 'var(--text2)',
                fontSize: 14,
                fontWeight: 600,
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all .2s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                flex: 2,
                padding: 12,
                background: submitting ? 'var(--gold3)' : 'var(--gold)',
                color: 'var(--bg)',
                fontSize: 14,
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'all .2s',
                letterSpacing: '.3px',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit anonymous report'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SuccessScreen({ result, onReset, onClose }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <i className="ti ti-circle-check" style={{ fontSize: 52, color: 'var(--gold)', display: 'block', marginBottom: 12 }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Report Submitted</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
        Your anonymous signal has been fed into the confidence engine for <strong style={{ color: 'var(--gold)' }}>{result.district}</strong>.
      </p>
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 16, marginBottom: 20, textAlign: 'left', border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <Row label="Your anon ID" value={`#${result.anon_id}`} mono />
          <Row label="Normalized symptoms" value={result.symptoms.join(', ')} />
          <Row label="Signal contribution" value={`+${result.signal_contribution || 15}%`} color="var(--gold)" />
          <Row label="District" value={result.district} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button 
          onClick={onReset} 
          style={{ 
            flex: 1, 
            padding: '10px 16px', 
            background: 'var(--bg3)', 
            color: 'var(--text2)', 
            fontWeight: 700, 
            fontSize: 13, 
            border: '1px solid var(--border)', 
            borderRadius: 8, 
            cursor: 'pointer' 
          }}
        >
          Submit another
        </button>
        <button 
          onClick={onClose} 
          style={{ 
            flex: 1, 
            padding: '10px 16px', 
            background: 'var(--gold)', 
            color: 'var(--bg)', 
            fontWeight: 700, 
            fontSize: 13, 
            border: 'none', 
            borderRadius: 8, 
            cursor: 'pointer' 
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}

function FormGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 18, width: '100%' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '.4px', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Row({ label, value, mono, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span style={{ color: color || 'var(--text2)', fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  padding: '10px 14px',
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'inherit',
}
