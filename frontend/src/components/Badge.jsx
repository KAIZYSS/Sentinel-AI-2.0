import React from 'react'

export default function Badge({ children, type = 'default', style = {} }) {
  let color = 'var(--text2)'
  let bg = 'rgba(255, 255, 255, 0.04)'
  let border = 'rgba(255, 255, 255, 0.08)'

  switch (type) {
    case 'gold':
    case 'primary':
      color = 'var(--gold)'
      bg = 'rgba(212, 175, 55, 0.1)'
      border = 'rgba(212, 175, 55, 0.2)'
      break
    case 'red':
    case 'error':
    case 'severe':
    case 'critical':
      color = 'var(--red)'
      bg = 'rgba(239, 68, 68, 0.1)'
      border = 'rgba(239, 68, 68, 0.25)'
      break
    case 'amber':
    case 'warning':
    case 'moderate':
    case 'elevated':
      color = 'var(--amber)'
      bg = 'rgba(245, 158, 11, 0.1)'
      border = 'rgba(245, 158, 11, 0.2)'
      break
    case 'green':
    case 'success':
    case 'mild':
    case 'stable':
      color = '#1de9b6'
      bg = 'rgba(29, 233, 182, 0.1)'
      border = 'rgba(29, 233, 182, 0.2)'
      break
    case 'blue':
    case 'info':
      color = 'var(--blue)'
      bg = 'rgba(59, 130, 246, 0.1)'
      border = 'rgba(59, 130, 246, 0.2)'
      break
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: 700,
      background: bg,
      color: color,
      border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
      ...style
    }}>
      {children}
    </span>
  )
}
