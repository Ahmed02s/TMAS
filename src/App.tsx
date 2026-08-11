import { Suspense, lazy, useEffect, useState } from 'react'
import { getPasswordResetIntent } from './utils/passwordReset'
import { getEmailVerificationIntent } from './utils/emailVerification'

// Each portal is a large, self-contained bundle (dashboards, forms, quiz UI) that only one
// visitor role ever needs at a time — lazy-loading them keeps the initial bundle to just
// whatever view the user actually lands on instead of shipping all five up front.
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Admin = lazy(() => import('./pages/Admin'))
const Lecturer = lazy(() => import('./pages/Lecturer'))
const Student = lazy(() => import('./pages/Student'))

function ViewLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <i className="fa-solid fa-circle-notch fa-spin text-2xl text-primary" />
    </div>
  )
}

export type AppView = 'landing' | 'login' | 'register' | 'admin' | 'lecturer' | 'student'

const VIEW_STORAGE_KEY = 'tmas-view'
const VALID_VIEWS: AppView[] = ['landing', 'login', 'register', 'admin', 'lecturer', 'student']

// A password-reset link is URL intent that must win over whatever view was last persisted
// (a logged-out visitor could easily have 'landing' saved from a prior session) and over
// whatever role-based portal a stored session would otherwise resolve to. It's checked
// first, before either of those, for exactly that reason.
function getInitialView(): AppView {
  if (typeof window === 'undefined') return 'landing'

  if (getPasswordResetIntent().open) return 'login'
  if (getEmailVerificationIntent().open) return 'login'

  const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY) as AppView | null
  if (storedView && VALID_VIEWS.includes(storedView)) {
    return storedView
  }

  const token = localStorage.getItem('tmas-token')
  const userString = localStorage.getItem('tmas-user')

  if (!token || !userString) return 'landing'

  try {
    const user = JSON.parse(userString) as { role?: string; status?: string }
    const role = user?.role
    const status = user?.status

    if (role === 'admin' || role === 'administrator') return 'admin'
    if (role === 'lecturer' && status === 'active') return 'lecturer'
    if (role === 'student') return 'student'
  } catch {
    return 'landing'
  }

  return 'landing'
}

export default function App() {
  const [view, setView] = useState<AppView>(getInitialView)

  // Persists the current portal so a refresh lands back where the user was, but a logged-out
  // visitor always persists as 'landing' — there's no portal to return them to without a
  // session, and the reset flow already recovers via `initialForgot`/URL intent, not this.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const token = localStorage.getItem('tmas-token')
    const userString = localStorage.getItem('tmas-user')

    window.localStorage.setItem(VIEW_STORAGE_KEY, !token || !userString ? 'landing' : view)
  }, [view])

  // Fired by the global fetch patch (src/utils/apiAuth.ts) whenever the backend rejects
  // the stored token as missing/expired/invalid — e.g. it was issued before this session
  // system existed, or its 7-day expiry passed. Local storage is already cleared at that
  // point; this just makes sure the UI actually reflects "logged out" instead of staying
  // stuck on a portal that will keep 401ing.
  useEffect(() => {
    function handleUnauthorized() {
      setView('login')
    }
    window.addEventListener('tmas:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('tmas:unauthorized', handleUnauthorized)
  }, [])

  return (
    <Suspense fallback={<ViewLoading />}>
      {view === 'landing' && <Landing onNavigate={setView} />}
      {view === 'login' && <Login onNavigate={setView} initialTab="login" />}
      {view === 'register' && <Login onNavigate={setView} initialTab="register" />}
      {view === 'admin' && <Admin onNavigate={setView} />}
      {view === 'lecturer' && <Lecturer onNavigate={setView} />}
      {view === 'student' && <Student onNavigate={setView} />}
    </Suspense>
  )
}
