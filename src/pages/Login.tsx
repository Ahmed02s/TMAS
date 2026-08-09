import { useEffect, useState } from 'react'
import type { AppView } from '../App'
import { API_BASE } from '../config'
import LegalModal from '../components/LegalModal'

const fallbackLevelOptions = ['Level 100', 'Level 200', 'Level 300', 'Level 400']
const programOptions = ['Computer Science', 'Mathematics', 'Engineering', 'Business']

// ── Validation helpers ─────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const STUDENT_ID_RE = /^[A-Z]{3}\d{7}$/

function validateEmail(val: string) {
  if (!val.trim()) return 'Email address is required.'
  if (!EMAIL_RE.test(val.trim())) return 'Enter a valid email address (e.g. you@gmail.com).'
  return ''
}

function validateStudentId(val: string) {
  if (!val.trim()) return 'Student Index Number is required.'
  if (!STUDENT_ID_RE.test(val.trim().toUpperCase()))
    return 'Index must be 3 uppercase letters followed by 7 digits (e.g. UEB3512822).'
  return ''
}

function FieldError({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-danger mt-1.5 font-medium">
      <i className="fa-solid fa-triangle-exclamation text-[10px]" />
      {msg}
    </p>
  )
}

function inputCls(hasError: boolean) {
  return `w-full px-4 py-3 bg-muted border rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 transition-colors ${
    hasError
      ? 'border-danger focus:ring-danger/30 focus:border-danger'
      : 'border-border focus:ring-primary/30 focus:border-primary'
  }`
}

export default function Login({ onNavigate, initialTab = 'login' }: { onNavigate: (v: AppView) => void; initialTab?: 'login' | 'register' }) {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab)
  const [role, setRole] = useState<'student' | 'lecturer'>('student')

  // ── Login fields ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [emailErr, setEmailErr] = useState('')
  const [passwordErr, setPasswordErr] = useState('')

  // ── Register fields ───────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [studentIndexNumber, setStudentIndexNumber] = useState('')
  const [studentLevel, setStudentLevel] = useState(fallbackLevelOptions[0])
  const [studentProgram, setStudentProgram] = useState('Computer Science')
  const [department, setDepartment] = useState('')

  // ── Register inline errors ────────────────────────────────────────────────
  const [firstNameErr, setFirstNameErr] = useState('')
  const [lastNameErr, setLastNameErr] = useState('')
  const [regEmailErr, setRegEmailErr] = useState('')
  const [regPasswordErr, setRegPasswordErr] = useState('')
  const [studentIdErr, setStudentIdErr] = useState('')

  const [availableLevels, setAvailableLevels] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lecturerPendingModal, setLecturerPendingModal] = useState(false)
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null)

  // ── Forgot / reset password ──────────────────────────────────────────────
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request')
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')

  function closeForgotModal() {
    setForgotOpen(false)
    setForgotStep('request')
    setForgotEmail('')
    setResetToken('')
    setNewPassword('')
    setForgotMessage('')
    setForgotError('')
  }

  async function handleForgotSubmit() {
    const eErr = validateEmail(forgotEmail)
    if (eErr) {
      setForgotError(eErr)
      return
    }
    setForgotBusy(true)
    setForgotError('')
    setForgotMessage('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not process request')
      setForgotMessage(data.message || 'If that email is registered, password reset instructions have been sent.')
      if (data.dev_reset_token) setResetToken(data.dev_reset_token)
      setForgotStep('reset')
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'Could not process request')
    } finally {
      setForgotBusy(false)
    }
  }

  async function handleResetSubmit() {
    if (!resetToken.trim()) {
      setForgotError('Reset token is required.')
      return
    }
    if (newPassword.length < 6) {
      setForgotError('Password must be at least 6 characters.')
      return
    }
    setForgotBusy(true)
    setForgotError('')
    setForgotMessage('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), new_password: newPassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not reset password')
      closeForgotModal()
      setTab('login')
      setStatusMessage('Password updated successfully. Please sign in with your new password.')
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'Could not reset password')
    } finally {
      setForgotBusy(false)
    }
  }

  useEffect(() => {
    async function loadLevels() {
      try {
        const response = await fetch(`${API_BASE}/api/levels`)
        if (!response.ok) return
        const data = await response.json()
        const levels = Array.isArray(data.levels) ? data.levels.map((l: any) => l.name).filter(Boolean) : []
        if (levels.length) {
          setAvailableLevels(levels)
          setStudentLevel(levels[0])
        } else {
          setStudentLevel(fallbackLevelOptions[0])
        }
      } catch {
        setStudentLevel(fallbackLevelOptions[0])
      }
    }
    loadLevels()
  }, [])

  // ── Clear helpers ─────────────────────────────────────────────────────────
  function clearLoginFields() {
    setEmail('')
    setPassword('')
    setEmailErr('')
    setPasswordErr('')
    setStatusMessage('')
  }

  function clearRegisterFields() {
    setFirstName('')
    setLastName('')
    setRegisterEmail('')
    setRegisterPassword('')
    setStudentIndexNumber('')
    setDepartment('')
    setFirstNameErr('')
    setLastNameErr('')
    setRegEmailErr('')
    setRegPasswordErr('')
    setStudentIdErr('')
    setStatusMessage('')
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async function handleLogin() {
    // Validate
    const eErr = validateEmail(email)
    const pErr = !password ? 'Password is required.' : ''
    setEmailErr(eErr)
    setPasswordErr(pErr)
    if (eErr || pErr) return

    setIsSubmitting(true)
    setStatusMessage('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Login failed')

      localStorage.setItem('tmas-token', data.token)
      localStorage.setItem('tmas-user', JSON.stringify(data.user))
      clearLoginFields()

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

  // ── Register ──────────────────────────────────────────────────────────────
  async function handleRegister() {
    // Run all validations
    const fnErr = !firstName.trim() ? 'First name is required.' : ''
    const lnErr = !lastName.trim() ? 'Last name is required.' : ''
    const reErr = validateEmail(registerEmail)
    const rpErr = !registerPassword ? 'Password is required.' : registerPassword.length < 6 ? 'Password must be at least 6 characters.' : ''
    const siErr = role === 'student' ? validateStudentId(studentIndexNumber) : ''

    setFirstNameErr(fnErr)
    setLastNameErr(lnErr)
    setRegEmailErr(reErr)
    setRegPasswordErr(rpErr)
    setStudentIdErr(siErr)

    if (fnErr || lnErr || reErr || rpErr || siErr) {
      setStatusMessage('Please fix the errors above.')
      return
    }

    setIsSubmitting(true)
    setStatusMessage('')
    const name = `${firstName.trim()} ${lastName.trim()}`

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email: registerEmail.trim(),
          password: registerPassword,
          role,
          ...(role === 'student'
            ? { level: studentLevel, program: studentProgram, index_number: studentIndexNumber.trim().toUpperCase() }
            : { department: department || 'Computer Science', program: department || 'Computer Science' }),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Registration failed')

      clearRegisterFields()

      if (role === 'lecturer') {
        try {
          const { dispatchPushNotification } = await import('../utils/notifications')
          await dispatchPushNotification({
            title: 'New Lecturer Registration Pending',
            message: `${name} (${registerEmail.trim()}) has registered and is awaiting administrator approval.`,
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
          <p className="text-accent text-xs font-bold uppercase tracking-widest mb-6">UENR</p>
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
                  onClick={() => { setTab(t); setStatusMessage('') }}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all capitalize ${tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            {/* ── LOGIN FORM ── */}
            {tab === 'login' ? (
              <>
                <h2 className="font-display text-3xl text-foreground mb-1.5">Welcome back</h2>
                <p className="text-muted-foreground text-sm mb-8">Sign in to your TMAS account to continue.</p>

                <div className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEmailErr('') }}
                      onBlur={() => setEmailErr(validateEmail(email))}
                      placeholder="you@university.edu"
                      className={inputCls(!!emailErr)}
                    />
                    <FieldError msg={emailErr} />
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-foreground">Password</label>
                      <button
                        type="button"
                        onClick={() => setForgotOpen(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setPasswordErr('') }}
                        onBlur={() => setPasswordErr(!password ? 'Password is required.' : '')}
                        placeholder="••••••••"
                        className={inputCls(!!passwordErr)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      >
                        <i className={`fa-solid ${showLoginPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </button>
                    </div>
                    <FieldError msg={passwordErr} />
                  </div>

                  <button
                    onClick={handleLogin}
                    disabled={isSubmitting}
                    className="w-full bg-primary hover:bg-blue-950 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isSubmitting ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Signing in...</> : 'Sign In'}
                  </button>
                  {statusMessage && (
                    <p className={`text-sm text-center mt-2 font-medium ${statusMessage.toLowerCase().includes('success') ? 'text-emerald-600' : 'text-danger'}`}>
                      {statusMessage}
                    </p>
                  )}
                </div>
              </>
            ) : (
              /* ── REGISTER FORM ── */
              <>
                <h2 className="font-display text-3xl text-foreground mb-1.5">Create account</h2>
                <p className="text-muted-foreground text-sm mb-6">Register to access the TMAS platform.</p>

                {/* Role toggle */}
                <div className="flex bg-muted rounded-xl p-1 mb-6">
                  {(['student', 'lecturer'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all capitalize ${role === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {r === 'student' ? <><i className="fa-solid fa-graduation-cap mr-1" />Student</> : <><i className="fa-solid fa-chalkboard-user mr-1" />Lecturer</>}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={e => { setFirstName(e.target.value); setFirstNameErr('') }}
                        onBlur={() => setFirstNameErr(!firstName.trim() ? 'First name is required.' : '')}
                        placeholder="John"
                        className={inputCls(!!firstNameErr)}
                      />
                      <FieldError msg={firstNameErr} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={e => { setLastName(e.target.value); setLastNameErr('') }}
                        onBlur={() => setLastNameErr(!lastName.trim() ? 'Last name is required.' : '')}
                        placeholder="Doe"
                        className={inputCls(!!lastNameErr)}
                      />
                      <FieldError msg={lastNameErr} />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={e => { setRegisterEmail(e.target.value); setRegEmailErr('') }}
                      onBlur={() => setRegEmailErr(validateEmail(registerEmail))}
                      placeholder="you@university.edu"
                      className={inputCls(!!regEmailErr)}
                    />
                    <FieldError msg={regEmailErr} />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showRegisterPassword ? 'text' : 'password'}
                        value={registerPassword}
                        onChange={e => { setRegisterPassword(e.target.value); setRegPasswordErr('') }}
                        onBlur={() => setRegPasswordErr(!registerPassword ? 'Password is required.' : registerPassword.length < 6 ? 'At least 6 characters.' : '')}
                        placeholder="••••••••"
                        className={inputCls(!!regPasswordErr)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                      >
                        <i className={`fa-solid ${showRegisterPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </button>
                    </div>
                    <FieldError msg={regPasswordErr} />
                  </div>

                  {/* Student-only fields */}
                  {role === 'student' ? (
                    <>
                      {/* Student Index Number */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Student Index Number
                          <span className="ml-2 text-xs text-muted-foreground font-normal">(e.g. UEB3512822)</span>
                        </label>
                        <input
                          type="text"
                          value={studentIndexNumber}
                          onChange={e => {
                            setStudentIndexNumber(e.target.value.toUpperCase())
                            setStudentIdErr('')
                          }}
                          onBlur={() => setStudentIdErr(validateStudentId(studentIndexNumber))}
                          placeholder="UEB3512822"
                          maxLength={10}
                          className={inputCls(!!studentIdErr)}
                        />
                        <FieldError msg={studentIdErr} />
                        {!studentIdErr && studentIndexNumber && STUDENT_ID_RE.test(studentIndexNumber) && (
                          <p className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1.5 font-medium">
                            <i className="fa-solid fa-circle-check text-[10px]" /> Valid index number format
                          </p>
                        )}
                      </div>

                      {/* Level & Program */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">Level</label>
                          <select
                            value={studentLevel}
                            onChange={e => setStudentLevel(e.target.value)}
                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                          >
                            {(availableLevels.length ? availableLevels : fallbackLevelOptions).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
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
                            {programOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Lecturer-only field */
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Department / Faculty</label>
                      <input
                        type="text"
                        value={department}
                        onChange={e => setDepartment(e.target.value)}
                        placeholder="e.g. Computer Science"
                        className={inputCls(false)}
                      />
                    </div>
                  )}

                  <button
                    onClick={handleRegister}
                    disabled={isSubmitting}
                    className="w-full bg-accent hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isSubmitting
                      ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Working...</>
                      : role === 'lecturer' ? 'Submit for Approval' : 'Create Account'}
                  </button>

                  {statusMessage && (
                    <p className={`text-sm text-center font-medium ${statusMessage.toLowerCase().includes('success') || statusMessage.toLowerCase().includes('created') ? 'text-emerald-600' : 'text-danger'}`}>
                      {statusMessage}
                    </p>
                  )}

                  {role === 'lecturer' && (
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      <i className="fa-solid fa-circle-info mr-1 text-primary" />
                      Lecturer accounts require administrator approval before platform access is granted.
                    </p>
                  )}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center mt-6">
              By continuing you agree to the TMAS{' '}
              <button type="button" onClick={() => setLegalModal('terms')} className="text-primary hover:underline">Terms of Service</button>{' '}
              and{' '}
              <button type="button" onClick={() => setLegalModal('privacy')} className="text-primary hover:underline">Privacy Policy</button>.
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
                Your lecturer application has been dispatched to the Administrator for approval.
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

      {/* ── Forgot / Reset Password Modal ── */}
      {forgotOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl p-8 max-w-md w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl font-bold text-foreground">
                {forgotStep === 'request' ? 'Reset your password' : 'Set a new password'}
              </h3>
              <button
                onClick={closeForgotModal}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-muted hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {forgotStep === 'request' ? (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Enter the email address on your account and we'll send you instructions to reset your password.
                </p>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); setForgotError('') }}
                    placeholder="you@university.edu"
                    className={inputCls(!!forgotError)}
                  />
                  <FieldError msg={forgotError} />
                </div>
                <button
                  onClick={handleForgotSubmit}
                  disabled={forgotBusy}
                  className="w-full bg-primary hover:bg-blue-950 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
                >
                  {forgotBusy ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Sending...</> : 'Send Reset Instructions'}
                </button>
              </>
            ) : (
              <>
                {forgotMessage && (
                  <p className="text-sm text-emerald-600 font-medium leading-relaxed">{forgotMessage}</p>
                )}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Reset Token</label>
                  <input
                    type="text"
                    value={resetToken}
                    onChange={e => { setResetToken(e.target.value); setForgotError('') }}
                    placeholder="Paste the reset token"
                    className={inputCls(false)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setForgotError('') }}
                    placeholder="••••••••"
                    className={inputCls(!!forgotError)}
                  />
                  <FieldError msg={forgotError} />
                </div>
                <button
                  onClick={handleResetSubmit}
                  disabled={forgotBusy}
                  className="w-full bg-primary hover:bg-blue-950 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
                >
                  {forgotBusy ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Updating...</> : 'Update Password'}
                </button>
                <button
                  onClick={() => setForgotStep('request')}
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
                >
                  Didn't get a token? Send again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}

    </div>
  )
}
