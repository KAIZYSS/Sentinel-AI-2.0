import React from 'react'

export default function MetricBox({ label, value, sub, color, glow, icon, style = {} }) {
  return (
    <div 
      className="glass-card"
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px 18px',
        boxShadow: glow ? `inset 0 0 30px ${glow}` : 'none',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
        flex: 1,
        minWidth: '160px',
        ...style
      }}
      onMouseEnter={e => { 
        e.currentTarget.style.transform = 'translateY(-2px)'
        if (glow) e.currentTarget.style.boxShadow = `inset 0 0 40px ${glow}, 0 4px 20px rgba(0,0,0,0.2)`
      }}
      onMouseLeave={e => { 
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = glow ? `inset 0 0 30px ${glow}` : 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--text3)' }}>
          {label}
        </div>
        {icon && <i className={`ti ${icon}`} style={{ fontSize: '15px', color: color || 'var(--gold)', opacity: 0.7 }} />}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-1.5px', color: color || 'var(--text)', lineHeight: 1, marginBottom: '6px' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}
