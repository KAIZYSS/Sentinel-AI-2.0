import { useState, useEffect } from 'react'
import Feed from './pages/Feed'
import Heatmap from './pages/Heatmap'
import ReportForm from './pages/ReportForm'
import Trends from './pages/Trends'
import Predictor from './pages/Predictor'
import Intelligence from './pages/Intelligence'
import { useLocation } from './context/LocationContext'
import ReportChatModal from './components/ReportChatModal'
import DoctorAgentModal from './components/DoctorAgentModal'

const TABS = [
  { id: 'dashboard',    icon: 'ti-layout-dashboard', label: 'Signal Feed' },
  { id: 'heatmap',      icon: 'ti-map-2',            label: 'Map View' },
  { id: 'intelligence', icon: 'ti-shield-lock',      label: 'Intelligence' },
  { id: 'predictions',  icon: 'ti-trending-up',      label: 'Trends' },
  { id: 'predictor',    icon: 'ti-stethoscope',      label: 'Symptom Predictor' },
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [time, setTime]  = useState(new Date())
  const {
    district,
    setDistrict,
    availableDistricts,
    locationMsg,
    setLocationMsg,
    locationSource,
    geoLoading,
    geoError,
    setGeoError,
    matchConfidence
  } = useLocation()
  
  // Submit modal state
  const [showReportModal, setShowReportModal] = useState(false)
  
  // Global chat state
  const [showGlobalChat, setShowGlobalChat] = useState(false)
  const [showDoctorAgent, setShowDoctorAgent] = useState(false)

  // Mobile drawer and tablet collapse states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-close mobile drawer when tab changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [page])

  return (
    <div className="app">
      
      {/* Drawer overlay for mobile */}
      <div 
        className={`drawer-overlay ${mobileMenuOpen ? 'visible' : ''}`} 
        onClick={() => setMobileMenuOpen(false)} 
      />

      {/* LEFT SIDEBAR */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="logo">
          <span className="logo-dot" />
          <span>Sentinel AI</span>
        </div>

        <nav className="nav-items">
          {TABS.map(t => (
            <NavTab key={t.id} id={t.id} active={page} setPage={setPage} icon={t.icon} label={t.label} />
          ))}
        </nav>
        
        <div className="sidebar-bottom">
           <div className="live-badge">
            <span className="live-dot" />
            Live Network
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Sidebar Collapse Toggle (For tablet view) */}
        <button 
          className="sidebar-collapse-btn" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <i className={`ti ti-layout-sidebar-${sidebarCollapsed ? 'expand' : 'collapse'}`} />
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        
        {/* TOP BAR */}
        <header className="top-bar">
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .spin { animation: spin 1s linear infinite; }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className="hamburger-btn" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Open Navigation"
            >
              <i className="ti ti-menu" />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i 
                  className={`ti ${geoLoading ? 'ti-loader spin' : 'ti-map-pin'}`} 
                  style={{ 
                    color: geoLoading ? 'var(--gold)' : locationSource === 'auto' ? '#00ffcc' : locationSource === 'manual' ? 'var(--gold)' : 'var(--text3)', 
                    fontSize: '18px' 
                  }}
                />
                <select 
                  value={district} 
                  onChange={e => setDistrict(e.target.value, 'manual')}
                  style={{
                    background: 'var(--bg2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                    minWidth: '200px'
                  }}
                >
                  {availableDistricts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span 
                  title={
                    geoLoading ? "Detecting district from browser geolocation" :
                    locationSource === 'auto' ? "District determined from browser location" :
                    locationSource === 'manual' ? "District selected by user" :
                    "Using fallback district"
                  }
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${geoLoading ? 'var(--gold)' : locationSource === 'auto' ? '#00ffcc' : locationSource === 'manual' ? 'var(--gold)' : 'var(--text3)'}`,
                    color: geoLoading ? 'var(--gold)' : locationSource === 'auto' ? '#00ffcc' : locationSource === 'manual' ? 'var(--gold)' : 'var(--text3)',
                    cursor: 'help'
                  }}
                >
                  {geoLoading ? '📍 Detecting...' : 
                   locationSource === 'auto' ? '📍 Auto Detected' : 
                   locationSource === 'manual' ? '📍 Selected' : 
                   '📍 Default'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '30px' }}>
                Location is used only to determine district context. Exact coordinates are not stored.
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
               onClick={() => setShowGlobalChat(true)}
               style={{
                 background: 'rgba(212, 175, 55, 0.1)',
                 color: 'var(--gold)',
                 border: '1px solid var(--gold)',
                 padding: '10px 20px',
                 borderRadius: '8px',
                 fontWeight: 600,
                 display: 'flex',
                 alignItems: 'center',
                 gap: '8px',
                 transition: 'all 0.2s',
                 boxShadow: '0 0 10px rgba(212, 175, 55, 0.2)'
               }}
               onMouseEnter={e => {
                 e.currentTarget.style.background = 'rgba(212, 175, 55, 0.2)'
                 e.currentTarget.style.boxShadow = '0 0 15px rgba(212, 175, 55, 0.4)'
               }}
               onMouseLeave={e => {
                 e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)'
                 e.currentTarget.style.boxShadow = '0 0 10px rgba(212, 175, 55, 0.2)'
               }}
            >
               <i className="ti ti-messages" style={{ fontSize: '18px' }} />
               {district ? `${district} Intel Chat` : 'Global Intel Chat'}
            </button>

            <button 
               onClick={() => setShowReportModal(true)}
               style={{
                 background: 'var(--gold)',
                 color: 'var(--bg)',
                 border: 'none',
                 padding: '10px 20px',
                 borderRadius: '8px',
                 fontWeight: 600,
                 display: 'flex',
                 alignItems: 'center',
                 gap: '8px'
               }}
            >
               <i className="ti ti-plus" />
               Submit Observation
            </button>
          </div>
        </header>

        {/* Dismissible Location Warnings */}
        {geoError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--red)',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '16px 24px 0 24px',
            color: 'var(--red)',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-alert-triangle" />
              <span>{geoError}</span>
            </div>
            <button 
              onClick={() => setGeoError(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--red)',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                padding: '0 4px',
                outline: 'none'
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Dismissible Location Info (Mapped localities) */}
        {locationMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #10b981',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '16px 24px 0 24px',
            color: '#10b981',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-map-pin" style={{ fontSize: '16px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>Location detected: <strong>{locationMsg.detected}</strong></div>
                <div>Mapped district: <strong>{locationMsg.mapped}</strong></div>
              </div>
            </div>
            <button 
              onClick={() => setLocationMsg(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#10b981',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                padding: '0 4px',
                outline: 'none'
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* PAGE RENDERER */}
        <main className="main-area">
          {page === 'dashboard'    && <Feed />}
          {page === 'predictor'    && <Predictor />}
          {page === 'predictions'  && <Trends />}
          {page === 'heatmap'      && <Heatmap />}
          {page === 'intelligence' && <Intelligence />}
        </main>
      </div>
      
      {/* FLOATING ACTION MODAL - Placeholder for Component 9 */}
      {showReportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h2 style={{ color: 'var(--gold)', margin: 0, fontSize: '20px' }}>Submit Observation</h2>
               <button onClick={() => setShowReportModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text2)', fontSize: '24px' }}>&times;</button>
            </div>
            <div style={{ padding: '24px' }}>
               <ReportForm onClose={() => setShowReportModal(false)} />
            </div>
          </div>
        </div>
      )}
      {/* FLOATING ACTION BUTTON (FAB) */}
      <button 
        onClick={() => setShowReportModal(true)}
        style={{
          position: 'fixed',
          bottom: '32px',
          right: '108px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--gold)',
          color: 'var(--bg)',
          border: 'none',
          boxShadow: '0 4px 20px rgba(212, 175, 55, 0.4), 0 0 10px rgba(212, 175, 55, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 999,
          fontSize: '24px',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(212, 175, 55, 0.6), 0 0 15px rgba(212, 175, 55, 0.3)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1) translateY(0)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 175, 55, 0.4), 0 0 10px rgba(212, 175, 55, 0.2)'
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)'}
        title="Submit Anonymously"
      >
        <i className="ti ti-plus" />
      </button>

      {/* Floating AI Doctor Button */}
      <button
        onClick={() => setShowDoctorAgent(true)}
        style={{
          position: 'fixed', bottom: '32px', right: '32px',
          background: 'linear-gradient(135deg, rgba(0, 255, 204, 0.2) 0%, rgba(0, 255, 204, 0.05) 100%)',
          border: '1px solid rgba(0, 255, 204, 0.4)',
          width: '56px', height: '56px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#00ffcc', fontSize: '24px', cursor: 'pointer', zIndex: 999,
          boxShadow: '0 8px 32px rgba(0, 255, 204, 0.2), inset 0 0 20px rgba(0,255,204,0.1)',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1) translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 255, 204, 0.4), inset 0 0 20px rgba(0,255,204,0.2)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1) translateY(0)';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 255, 204, 0.2), inset 0 0 20px rgba(0,255,204,0.1)';
        }}
        title="Ask Sentinel Medical AI"
      >
        <i className="ti ti-robot" />
      </button>

      {/* GLOBAL CHAT MODAL */}
      {showGlobalChat && (
        <ReportChatModal 
          report={{ 
            anon_id: district ? `REGION-${district}` : 'GLOBAL', 
            probable_disease: district ? 'Regional Activity' : 'Network', 
            district: district || 'All Regions' 
          }} 
          onClose={() => setShowGlobalChat(false)} 
        />
      )}

      {showDoctorAgent && (
        <DoctorAgentModal
          district={district}
          onClose={() => setShowDoctorAgent(false)}
        />
      )}
    </div>
  )
}

function NavTab({ id, active, setPage, icon, label }) {
  const isActive = active === id
  return (
    <button
      onClick={() => setPage(id)}
      style={{
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--gold)' : 'var(--text2)',
        background: isActive ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
        border: isActive ? '1px solid rgba(212, 175, 55, 0.2)' : '1px solid transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'all .2s ease',
        letterSpacing: '0.3px',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.color = 'var(--text2)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 18 }} />
      {label}
    </button>
  )
}
