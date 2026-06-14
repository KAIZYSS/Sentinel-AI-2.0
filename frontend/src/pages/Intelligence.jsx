import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useLocation } from '../context/LocationContext'

export default function Intelligence() {
  const { district } = useLocation()
  const [intelligence, setIntelligence] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [signals, setSignals] = useState([])
  const [groundTruth, setGroundTruth] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [showEvidence, setShowEvidence] = useState(false)
  const [reportModal, setReportModal] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [intel, snap, sigs, gt, profs] = await Promise.all([
        api.getIntelligence(district).catch(() => null),
        api.getSnapshot(district).catch(() => null),
        api.getSignals(district),
        api.getGroundTruth(district),
        api.getDiseaseProfiles()
      ])
      setIntelligence(intel)
      setSnapshot(snap)
      setSignals(sigs)
      setGroundTruth(gt?.idsp_records || [])
      setProfiles(profs || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [district])

  const handleGenerateReport = async () => {
    setReportLoading(true)
    try {
      const res = await api.getIntelligenceReport(district)
      setReportModal(res.report)
    } catch (e) {
      setReportModal(`# Error\n\nFailed to generate report: ${e.message}`)
    } finally {
      setReportLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 64, textAlign: 'center', color: 'var(--text3)' }}>
        <i className="ti ti-brain" style={{ fontSize: 32, display: 'block', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>Sentinel AI is analyzing {district || 'regional'} intelligence...</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Aggregating reports, signals, trends, and ground truth</div>
      </div>
    )
  }

  // Derive values from Gemini intelligence or fallback to computed
  const threatLevel = intelligence?.threat_level || 'unknown'
  const threatColors = { critical: 'var(--red)', high: '#f59e0b', elevated: 'var(--amber)', guarded: 'var(--gold)', low: 'var(--text3)' }
  const threatColor = threatColors[threatLevel] || 'var(--gold)'
  const source = intelligence?._meta?.source || 'computed'
  const isGemini = source === 'gemini-2.5-flash'

  // Signal stats for evidence trail
  const activeSigs = signals.filter(s => s.confidence >= 40)
  const maxConfidence = signals.length ? Math.max(...signals.map(s => s.confidence)) : 0
  const confirmedIDSPCases = groundTruth.reduce((sum, r) => sum + (r.confirmed_cases || 0), 0)
  const totalDeaths = groundTruth.reduce((sum, r) => sum + (r.deaths || 0), 0)

  // Section renderer for Gemini intelligence blocks
  const IntelSection = ({ icon, title, content, color }) => (
    <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: color || 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className={`ti ti-${icon}`} /> {title}
      </h4>
      <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
        {content || 'Insufficient evidence available.'}
      </p>
    </div>
  )

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.7px', lineHeight: 1.1 }}>
            AI Intelligence Briefing
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '5px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isGemini ? (
              <><i className="ti ti-brain" style={{ color: 'var(--gold)' }} /> Powered by Gemini 2.5 Flash · {intelligence?._meta?.generated_at ? new Date(intelligence._meta.generated_at).toLocaleString() : 'Live'}</>
            ) : (
              <><i className="ti ti-cpu" /> Computed analysis · No Gemini API available</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            onClick={handleGenerateReport}
            disabled={reportLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: 'var(--gold)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: reportLoading ? 0.6 : 1 }}
          >
            <i className={`ti ti-${reportLoading ? 'loader' : 'file-report'}`} style={reportLoading ? { animation: 'spin 1s linear infinite' } : {}} /> 
            {reportLoading ? 'Generating...' : 'Generate Report'}
          </button>
          <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <i className="ti ti-refresh" /> Revalidate
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: '8px', padding: '12px 16px', color: 'var(--red)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* THREAT ASSESSMENT BANNER */}
      <div className="glass-card" style={{
        background: `linear-gradient(135deg, rgba(10, 14, 23, 0.9) 0%, ${threatColor}08 100%)`,
        border: `1px solid ${threatColor}33`,
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: threatColor, boxShadow: `0 0 12px ${threatColor}`, display: 'inline-block' }} />
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              District Classification: <span style={{ color: threatColor }}>{threatLevel}</span>
            </span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
            {district || 'All Regions'} · {snapshot?.report_count || 0} reports · {signals.length} signals · {groundTruth.length} IDSP records
          </span>
        </div>

        {/* SITUATION SUMMARY — The flagship AI narrative */}
        <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: '1.7', margin: 0 }}>
          {intelligence?.situation_summary || `No intelligence available for ${district || 'this region'}. Insufficient data for assessment.`}
        </p>

        {/* Narrative Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '8px' }}>
          <div style={{ background: 'var(--bg2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>MAX SIGNAL STRENGTH</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gold)', marginTop: '4px' }}>{maxConfidence.toFixed(1)}%</div>
          </div>
          <div style={{ background: 'var(--bg2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>CONFIRMED PATHOGENS</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{confirmedIDSPCases}</div>
          </div>
          <div style={{ background: 'var(--bg2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>CONFIDENCE LEVEL</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: threatColor, marginTop: '4px', textTransform: 'uppercase' }}>{intelligence?.confidence_level || 'N/A'}</div>
          </div>
          <div style={{ background: 'var(--bg2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>CONVERGENCE</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: (snapshot?.convergence_score || 0) > 0.5 ? 'var(--gold)' : 'var(--text3)', marginTop: '4px' }}>{((snapshot?.convergence_score || 0) * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* GEMINI INTELLIGENCE SECTIONS — 2x2 Grid */}
      <div className="grid-responsive-2" style={{ gap: '16px' }}>
        <IntelSection icon="report-analytics" title="Supporting Evidence" content={intelligence?.evidence} />
        <IntelSection icon="virus" title="Disease Drivers" content={intelligence?.disease_drivers} />
        <IntelSection icon="gauge" title="Confidence Assessment" content={intelligence?.confidence_assessment} />
        <IntelSection icon="alert-triangle" title="Emerging Risks" content={intelligence?.emerging_risks} color={intelligence?.emerging_risks && !intelligence.emerging_risks.includes('No emerging') ? 'var(--amber)' : 'var(--gold)'} />
      </div>

      {/* MONITORING RECOMMENDATIONS + PUBLIC HEALTH */}
      <div className="grid-responsive-2" style={{ gap: '16px' }}>
        <IntelSection icon="eye" title="Monitoring Recommendations" content={intelligence?.recommendations} />
        <IntelSection icon="stethoscope" title="Public Health Observations" content={intelligence?.public_health_observations} />
      </div>

      {/* EXPLAINABILITY: "Why did Sentinel AI conclude this?" */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div 
          onClick={() => setShowEvidence(!showEvidence)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        >
          <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-search" /> Why did Sentinel AI conclude this?
          </h4>
          <i className={`ti ti-chevron-${showEvidence ? 'up' : 'down'}`} style={{ color: 'var(--text3)' }} />
        </div>
        
        {showEvidence && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Explainability from Gemini */}
            {intelligence?.explainability && (
              <div className="grid-responsive-3" style={{ gap: '12px' }}>
                <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 700, marginBottom: 6 }}>PRIMARY SOURCES</div>
                  {(intelligence.explainability.primary_sources || []).map((s, i) => (
                    <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} /> {s}
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 700, marginBottom: 6 }}>CONVERGENCE FACTORS</div>
                  {(intelligence.explainability.convergence_factors || []).length > 0 ? (
                    intelligence.explainability.convergence_factors.map((f, i) => (
                      <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: 3 }}>• {f}</div>
                    ))
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Limited convergence</div>
                  )}
                </div>
                <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 700, marginBottom: 6 }}>UNCERTAINTY FACTORS</div>
                  {(intelligence.explainability.uncertainty_factors || []).length > 0 ? (
                    intelligence.explainability.uncertainty_factors.map((f, i) => (
                      <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: 3 }}>⚠ {f}</div>
                    ))
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>No major uncertainties</div>
                  )}
                </div>
              </div>
            )}

            {/* Raw evidence trail */}
            <div className="grid-responsive-2" style={{ gap: '12px' }}>
              <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>SIGNAL EVIDENCE</div>
                {signals.length > 0 ? signals.slice(0, 6).map((s, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.name?.split(' · ')[0]}</span>
                    <span style={{ color: s.confidence >= 60 ? 'var(--gold)' : 'var(--text3)', fontWeight: 600 }}>{s.confidence?.toFixed(1)}%</span>
                  </div>
                )) : <div style={{ fontSize: '11px', color: 'var(--text3)' }}>No signals</div>}
              </div>
              <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>IDSP GROUND TRUTH</div>
                {groundTruth.length > 0 ? groundTruth.slice(0, 6).map((g, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{g.disease}</span>
                    <span>{g.confirmed_cases || 0} confirmed{g.deaths > 0 ? `, ${g.deaths} deaths` : ''}</span>
                  </div>
                )) : <div style={{ fontSize: '11px', color: 'var(--text3)' }}>No IDSP records</div>}
              </div>
            </div>

            {/* Snapshot data summary */}
            {snapshot && (
              <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 700, marginBottom: 8 }}>DISTRICT SNAPSHOT (RAW DATA)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '11px', color: 'var(--text2)' }}>
                  <div>Reports: <strong>{snapshot.report_count}</strong></div>
                  <div>Avg Trust: <strong>{(snapshot.average_trust_score * 100).toFixed(0)}%</strong></div>
                  <div>Trend Momentum: <strong>{snapshot.trend_momentum}</strong></div>
                  <div>Outbreak Status: <strong>{snapshot.outbreak_status}</strong></div>
                  <div>Dominant: <strong>{snapshot.dominant_disease || 'None'}</strong></div>
                  <div>Convergence: <strong>{(snapshot.convergence_score * 100).toFixed(0)}%</strong></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE SIGNALS & PATHOGEN PROFILES */}
      <div className="grid-trends" style={{ gridTemplateColumns: '1fr 340px' }}>
        
        {/* SIGNAL LIST */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-antenna-bars-5" style={{ color: 'var(--gold)' }} /> Active Signals ({signals.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: 400, overflow: 'auto' }}>
            {signals.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                No active signals for {district || 'this region'}
              </div>
            ) : signals.map((sig, idx) => {
              const statusColor = sig.confidence >= 80 ? 'var(--red)' : sig.confidence >= 40 ? 'var(--amber)' : 'var(--gold3)'
              const statusLabel = sig.confidence >= 80 ? 'High Confidence Signal' : sig.confidence >= 40 ? 'Elevated Activity' : 'Emerging Cluster'
              return (
                <div key={idx} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{sig.name}</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: statusColor }}>{sig.confidence?.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{statusLabel}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{sig.report_count} reports · {sig.sources?.join(', ')}</span>
                  </div>
                  <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(sig.confidence, 100)}%`, background: statusColor, borderRadius: 2 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* PATHOGEN PROFILES */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-microscope" style={{ color: 'var(--gold)' }} /> Pathogen Profiles
          </h3>
          {profiles.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>No profiles loaded</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {profiles.slice(0, 8).map((prof, idx) => (
                <div 
                  key={idx}
                  onClick={() => setSelectedProfile(selectedProfile === prof.name ? null : prof.name)}
                  style={{ 
                    background: selectedProfile === prof.name ? 'rgba(212,175,55,0.08)' : 'var(--bg2)', 
                    border: `1px solid ${selectedProfile === prof.name ? 'var(--gold)' : 'var(--border)'}`,
                    borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>{prof.name}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gold)' }}>
                      Threat: {prof.current_threat_level || 'N/A'}
                    </span>
                  </div>
                  {selectedProfile === prof.name && (
                    <div style={{ marginTop: 8, fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5 }}>
                      {prof.symptoms && <div><strong>Symptoms:</strong> {Array.isArray(prof.symptoms) ? prof.symptoms.join(', ') : prof.symptoms}</div>}
                      {prof.transmission && <div><strong>Transmission:</strong> {prof.transmission}</div>}
                      {prof.incubation_period && <div><strong>Incubation:</strong> {prof.incubation_period}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* IDSP GROUND TRUTH REGISTRY */}
      {groundTruth.length > 0 && (
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-certificate" style={{ color: 'var(--gold)' }} /> IDSP Ground Truth Registry ({groundTruth.length} records)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Disease', 'Confirmed', 'Suspected', 'Deaths', 'Week', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text3)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groundTruth.slice(0, 10).map((g, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{g.disease}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{g.confirmed_cases || 0}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{g.suspected_cases || 0}</td>
                    <td style={{ padding: '8px 12px', color: (g.deaths || 0) > 0 ? 'var(--red)' : 'var(--text3)' }}>{g.deaths || 0}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{g.epi_week || 'N/A'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: (g.confirmed_cases || 0) > 10 ? 'var(--amber)' : 'var(--gold3)', textTransform: 'uppercase' }}>
                        {(g.confirmed_cases || 0) > 10 ? 'Active' : 'Monitoring'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {reportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: 800, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Intelligence Report</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={() => { navigator.clipboard.writeText(reportModal); }}
                  style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <i className="ti ti-copy" /> Copy
                </button>
                <button 
                  onClick={() => setReportModal(null)}
                  style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>
            <pre style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {reportModal}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
