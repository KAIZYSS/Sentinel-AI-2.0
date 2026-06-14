import React from 'react'

export default function Card({ title, icon, iconColor, action, children, style = {}, onClick }) {
  return (
    <div 
      className="glass-card" 
      onClick={onClick}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s, box-shadow 0.2s',
        ...style
      }}
    >
      {(title || icon || action) && (
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {icon && <i className={`ti ${icon}`} style={{ fontSize: '15px', color: iconColor || 'var(--gold)' }} />}
            {title && (
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {title}
              </span>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
