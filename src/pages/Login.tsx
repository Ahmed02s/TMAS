import { useEffect, useState } from 'react'
import type { AppView } from '../App'
import { API_BASE } from '../config'
const fallbackLevelOptions = ['Level 100', 'Level 200', 'Level 300', 'Level 400']
const programOptions = ['Computer Science', 'Mathematics', 'Engineering', 'Business']

export default function Login({ onNavigate, initialTab = 'login' }: { onNavigate: (v: AppView) => void; initialTab?: 'login' | 'register' }) {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab)
  const [role, setRole] = useState<'student' | 'lecturer'>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [studentIndexNumber, setStudentIndexNumber] = useState('')
  const [studentLevel, setStudentLevel] = useState(fallbackLevelOptions[0])
  const [studentProgram, setStudentProgram] = useState('Computer Science')
  const [department, setDepartment] = useState('')
  const [availableLevels, setAvailableLevels] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lecturerPendingModal, setLecturerPendingModal] = useState(false)

  async function handleLogin() {
    setIsSubmitting(true)
    setStatusMessage('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Login failed')
      }

      localStorage.setItem('tmas-token', data.token)
      localStorage.setItem('tmas-user', JSON.stringify(data.user))
      setStatusMessage(`Signed in as ${data.user.role}`)
      if (data.user.role === 'admin' || data.user.role === 'administrator') {
        onNavigate('admin')
      } else if (data.user.role === 'lecturer') {
        localStorage.setItem('tmas-lecturer-tab', 'overview')
        onNavigate('lecturer')
      } else {
        localStorage.setItem('tmas-student-tab', 'overview')
        onNavigate('student')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    async function loadLevels() {
      try {
        const response = await fetch(`${API_BASE}/api/levels`)
        if (!response.ok) return
        const data = await response.json()
        const levels = Array.isArray(data.levels) ? data.levels.map((level: any) => level.name).filter(Boolean) : []
        if (levels.length) {
          setAvailableLevels(levels)
          setStudentLevel(levels[0])
        } else {
          setStudentLevel(fallbackLevelOptions[0])
        }
      } catch (err) {
        console.error('Failed to load available levels', err)
        setStudentLevel(fallbackLevelOptions[0])
      }
    }
    loadLevels()
  }, [])

  async function handleRegister() {
    setIsSubmitting(true)
    setStatusMessage('')
    const name = [firstName, lastName].filter(Boolean).join(' ').trim()

    if (!name) {
      setStatusMessage('Please enter your name.')
      setIsSubmitting(false)
      return
    }

    if (!registerEmail && !email) {
      setStatusMessage('Please enter your email address.')
      setIsSubmitting(false)
      return
    }

    if (!registerPassword && !password) {
      setStatusMessage('Please enter a password.')
      setIsSubmitting(false)
      return
    }

    if (role === 'student' && (!studentLevel || !studentProgram)) {
      setStatusMessage('Please select your academic level and program.')
      setIsSubmitting(false)
      return
    }

    if (role === 'student' && !studentIndexNumber.trim()) {
      setStatusMessage('Please enter your Student Index Number.')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email: registerEmail || email,
          password: registerPassword || password,
          role,
          ...(role === 'student' ? { level: studentLevel, program: studentProgram, index_number: studentIndexNumber.trim() } : { department: department || 'Computer Science', program: department || 'Computer Science' }),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Registration failed')
      }

      if (role === 'lecturer') {
        try {
          const { dispatchPushNotification } = await import('../utils/notifications')
          await dispatchPushNotification({
            title: 'New Lecturer Registration Pending',
            message: `${name} (${email}) has registered and is awaiting administrator approval.`,
            target_role: 'admin',
            type: 'warning',
          })
        } catch {}
        setLecturerPendingModal(true)
      } else {
        setStatusMessage('Student account created successfully! Please log in.')
        setTab('login')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Registration failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-sidebar flex">

      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[48%] p-14 relative overflow-hidden">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2.5 w-fit group">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white text-sm font-bold font-mono">T</span>
          </div>
          <span className="text-sidebar-foreground font-semibold text-lg">TMAS</span>
        </button>

        <div>
          <p className="text-accent text-xs font-bold uppercase tracking-widest mb-6">Meridian University</p>
          <h1 className="font-display text-5xl text-sidebar-foreground leading-tight mb-6">
            Empowering<br />education<br />through <span className="text-accent">intelligence.</span>
          </h1>
          <p className="text-sidebar-foreground/55 text-base leading-relaxed max-w-xs">
            Join thousands of students and educators using TMAS to transform the higher education experience.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { val: '2,847', label: 'Students' },
            { val: '94', label: 'Active Courses' },
            { val: '87%', label: 'Completion Rate' },
            { val: '14k+', label: 'Quizzes Generated' },
          ].map((s, i) => (
            <div key={i} className="bg-white/5 border border-white/8 rounded-xl p-4">
              <p className="text-accent text-xl font-bold font-mono">{s.val}</p>
              <p className="text-sidebar-foreground/45 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-52 h-52 bg-accent/8 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background/3">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to home
            </button>
          </div>

          <div className="bg-card rounded-3xl p-8 shadow-xl">
            {/* Tab toggle */}
            <div className="flex bg-muted rounded-xl p-1 mb-8">
              {(['login', 'register'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all capitalize ${tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            {tab === 'login' ? (
              <>
                <h2 className="font-display text-3xl text-foreground mb-1.5">Welcome back</h2>
                <p className="text-muted-foreground text-sm mb-8">Sign in to your TMAS account to continue.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-foreground">Password</label>
                      <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleLogin}
                    disabled={isSubmitting}
                    className="w-full bg-primary hover:bg-blue-950 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isSubmitting ? 'Signing in...' : 'Sign In'}
                  </button>
                  {statusMessage && (
                    <p className={`text-sm text-center mt-2 ${statusMessage.toLowerCase().includes('success') || statusMessage.toLowerCase().includes('created') ? 'text-emerald-600 font-medium' : 'text-danger'}`}>{statusMessage}</p>
                  )}
                </div>


              </>
            ) : (
              <>
                <h2 className="font-display text-3xl text-foreground mb-1.5">Create account</h2>
                <p className="text-muted-foreground text-sm mb-6">Register to access the TMAS platform.</p>

                <div className="flex bg-muted rounded-xl p-1 mb-6">
                  {(['student', 'lecturer'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all capitalize ${role === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {r === 'student' ? '🎓 Student' : '👩‍🏫 Lecturer'}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={e => setRegisterEmail(e.target.value)}
                      placeholder="you@university.edu"
                      className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={e => setRegisterPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  {role === 'student' ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Student Index Number</label>
                        <input
                          type="text"
                          value={studentIndexNumber}
                          onChange={e => setStudentIndexNumber(e.target.value)}
                          placeholder="e.g. 10203040"
                          className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Level</label>
                        <select
                          value={studentLevel}
                          onChange={e => setStudentLevel(e.target.value)}
                          className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                        >
                          {(availableLevels.length ? availableLevels : fallbackLevelOptions).map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Program</label>
                        <select
                          value={studentProgram}
                          onChange={e => setStudentProgram(e.target.value)}
                          className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                        >
                          {programOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Department / Faculty</label>
                      <input
                        type="text"
                        value={department}
                        onChange={e => setDepartment(e.target.value)}
                        placeholder="e.g. Computer Science"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  )}
                  <button
                    onClick={handleRegister}
                    disabled={isSubmitting}
                    className="w-full bg-accent hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isSubmitting ? 'Working...' : role === 'lecturer' ? 'Submit for Approval' : 'Create Account'}
                  </button>
                  {statusMessage && (
                    <p className={`text-sm text-center ${statusMessage.toLowerCase().includes('success') || statusMessage.toLowerCase().includes('created') ? 'text-emerald-600 font-medium' : 'text-primary'}`}>{statusMessage}</p>
                  )}
                  {role === 'lecturer' && (
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      Lecturer accounts require administrator approval before platform access is granted.
                    </p>
                  )}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center mt-6">
              By continuing you agree to the TMAS{" "}
              <a href="#" className="text-primary hover:underline">Terms of Service</a>{" "}
              and{" "}
              <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>

      {/* ── Lecturer Registration Success Modal ── */}
      {lecturerPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-2xl">
              <i className="fa-solid fa-hourglass-half" />
            </div>
            <div>
              <h3 className="font-display text-2xl font-bold text-foreground">Registration Submitted!</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Your lecturer application for <span className="font-semibold text-foreground">{firstName} {lastName}</span> has been dispatched to the Administrator for approval.
              </p>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-primary text-left space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <i className="fa-solid fa-bell text-xs text-amber-500" />
                <span>Real-Time Push Notification Dispatched</span>
              </p>
              <p className="text-muted-foreground leading-relaxed">
                An instant push alert was sent to the Administrator dashboard. You will receive access once approved!
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => { setLecturerPendingModal(false); setTab('login') }}
                className="w-full bg-primary hover:bg-blue-950 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Sign In with Approved Account →
              </button>
              <button
                onClick={() => onNavigate('landing')}
                className="w-full bg-muted hover:bg-secondary text-foreground font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Return to Homepage
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
