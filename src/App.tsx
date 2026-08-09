import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Lecturer from './pages/Lecturer'
import Student from './pages/Student'

export type AppView = 'landing' | 'login' | 'register' | 'admin' | 'lecturer' | 'student'

const VIEW_STORAGE_KEY = 'tmas-view'
const VALID_VIEWS: AppView[] = ['landing', 'login', 'register', 'admin', 'lecturer', 'student']

function getInitialView(): AppView {
  if (typeof window === 'undefined') return 'landing'

  const path = window.location.pathname
  if (path === '/forgot-password' || path === '/reset-password') {
    return 'login'
  }

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

function getInitialForgotState() {
  if (typeof window === 'undefined') {
    return { open: false, token: '', step: 'request' as const }
  }

  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')?.trim() ?? ''

  if (path === '/forgot-password' || path === '/reset-password') {
    return {
      open: true,
      token,
      step: token ? 'reset' as const : 'request' as const,
    }
  }

  return { open: false, token: '', step: 'request' as const }
}

export default function App() {
  const [view, setView] = useState<AppView>(getInitialView)
  const initialForgot = getInitialForgotState()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const token = localStorage.getItem('tmas-token')
    const userString = localStorage.getItem('tmas-user')

    if (!token || !userString) {
      window.localStorage.setItem(VIEW_STORAGE_KEY, 'landing')
      return
    }

    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  }, [view])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const path = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    if ((path === '/forgot-password' || path === '/reset-password') && params.has('token')) {
      window.history.replaceState(null, '', path)
    }
  }, [])

  // Fired by the global fetch patch (src/utils/apiAuth.ts) whenever the backend rejects
  // the stored token as missing/expired/invalid — e.g. it was issued before this session
    function handleUnauthorized() {
      setView('login')
    }
    window.addEventListener('tmas:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('tmas:unauthorized', handleUnauthorized)
  }, [])

  return (
    <>
      {view === 'landing' && <Landing onNavigate={setView} />}
      {view === 'login' && (
        <Login
          onNavigate={setView}
          initialTab="login"
          initialForgotOpen={initialForgot.open}
          initialForgotStep={initialForgot.step}
          initialResetToken={initialForgot.token}
        />
      )}
      {view === 'register' && <Login onNavigate={setView} initialTab="register" />}
      {view === 'admin' && <Admin onNavigate={setView} />}
      {view === 'lecturer' && <Lecturer onNavigate={setView} />}
      {view === 'student' && <Student onNavigate={setView} />}
    </>
  )
}
