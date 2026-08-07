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

  return (
    <>
      {view === 'landing' && <Landing onNavigate={setView} />}
      {view === 'login' && <Login onNavigate={setView} initialTab="login" />}
      {view === 'register' && <Login onNavigate={setView} initialTab="register" />}
      {view === 'admin' && <Admin onNavigate={setView} />}
      {view === 'lecturer' && <Lecturer onNavigate={setView} />}
      {view === 'student' && <Student onNavigate={setView} />}
    </>
  )
}
