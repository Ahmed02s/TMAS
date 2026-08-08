import { useState } from 'react'
import Icon from './Icon'

type UserProfileModalProps = {
  open: boolean
  onClose: () => void
  user: {
    id?: string
    name?: string
    email?: string
    role?: string
    level?: string
    program?: string
    department?: string
    index_number?: string
    created_at?: string
  } | null
  onLogout: () => void
}

export default function ProfileModal({ open, onClose, user, onLogout }: UserProfileModalProps) {
  const [copied, setCopied] = useState(false)

  if (!open || !user) return null

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const roleTitle = user.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'User'

  const handleCopyId = () => {
    if (user.id) {
      navigator.clipboard.writeText(user.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
        
        {/* Banner */}
        <div className="h-24 bg-gradient-to-r from-primary via-blue-900 to-indigo-950 p-4 flex justify-between items-start relative">
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white border border-white/20 backdrop-blur">
            {roleTitle} Profile
          </span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/20 text-white hover:bg-black/40 flex items-center justify-center transition-colors">
            ✕
          </button>
        </div>

        {/* Avatar & Header Info */}
        <div className="px-6 pb-6 relative">
          <div className="-mt-12 mb-4 flex items-end justify-between">
            <div className="w-20 h-20 rounded-2xl bg-primary text-white border-4 border-card flex items-center justify-center shadow-lg text-2xl font-bold font-mono">
              {initials}
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Active Account
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground">{user.name || 'Anonymous User'}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          </div>

          {/* User Details Grid */}
          <div className="mt-6 space-y-3 bg-muted/50 border border-border/60 rounded-2xl p-4 text-xs sm:text-sm">
            {user.role === 'student' && user.index_number && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                <span className="text-muted-foreground font-medium">Index Number</span>
                <span className="font-mono font-semibold text-foreground bg-background px-2 py-0.5 rounded-lg border border-border">
                  {user.index_number}
                </span>
              </div>
            )}

            {user.level && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                <span className="text-muted-foreground font-medium">Academic Level</span>
                <span className="font-semibold text-primary">{user.level}</span>
              </div>
            )}

            {(user.program || user.department) && (
              <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                <span className="text-muted-foreground font-medium">Program / Dept</span>
                <span className="font-medium text-foreground text-right">{user.program || user.department}</span>
              </div>
            )}

            <div className="flex justify-between items-center py-1.5">
              <span className="text-muted-foreground font-medium">Account ID</span>
              <button onClick={handleCopyId} className="font-mono text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 bg-background px-2 py-0.5 rounded-lg border border-border">
                {user.id ? `${user.id.slice(0, 8)}...` : 'N/A'}
                <Icon name="copy" size={12} />
                {copied && <span className="text-[10px] text-emerald-600 font-bold ml-1">Copied!</span>}
              </button>
            </div>
          </div>

          {/* Logout Action */}
          <div className="mt-6 pt-2 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-border bg-background text-foreground text-xs font-semibold hover:bg-muted transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                onClose()
                onLogout()
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-danger/10 text-danger border border-danger/20 text-xs font-semibold hover:bg-danger/20 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
