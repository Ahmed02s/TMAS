import React from 'react'

export default function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' }
  switch (name) {
    case 'timer':
      return (
        <svg {...common} className={className}>
          <path d="M12 8v5l3 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'document':
      return (
        <svg {...common} className={className}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'book':
      return (
        <svg {...common} className={className}>
          <path d="M3 6a2 2 0 012-2h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 6v13a1 1 0 01-1 1H7a2 2 0 01-2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'trophy':
      return (
        <svg {...common} className={className}>
          <path d="M8 21h8M12 17v4M7 4h10v4a4 4 0 01-4 4H11a4 4 0 01-4-4V4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'bolt':
      return (
        <svg {...common} className={className}>
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'target':
      return (
        <svg {...common} className={className}>
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common} className={className}>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M16 3v4M8 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'robot':
      return (
        <svg {...common} className={className}>
          <rect x="3" y="7" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="9" cy="12" r="1" fill="currentColor" />
          <circle cx="15" cy="12" r="1" fill="currentColor" />
        </svg>
      )
    case 'upload':
      return (
        <svg {...common} className={className}>
          <path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="15" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg {...common} className={className}>
          <path d="M9 2h6v4H9z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="4" y="6" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
    case 'analytics':
      return (
        <svg {...common} className={className}>
          <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="7" y="12" width="2" height="6" fill="currentColor" />
          <rect x="11" y="8" width="2" height="10" fill="currentColor" />
          <rect x="15" y="4" width="2" height="14" fill="currentColor" />
        </svg>
      )
    case 'celebrate':
      return (
        <svg {...common} className={className}>
          <path d="M12 2v4M4.9 4.9l2.8 2.8M2 12h4M4.9 19.1l2.8-2.8M12 20v2M19.1 19.1l-2.8-2.8M20 12h-4M19.1 4.9l-2.8 2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg {...common} className={className}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
  }
}
