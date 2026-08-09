import { useEffect, useMemo, useState, useRef, useCallback, lazy, Suspense } from 'react'
import type { AppView } from '../App'
import { API_BASE } from '../config'
import Icon from '../components/Icon'
import ProfileModal from '../components/ProfileModal'

// pdfjs/mammoth/jszip are heavy parsing libraries only needed once a student actually
// opens a material — code-split so they don't bloat the initial app bundle.
const MaterialViewer = lazy(() => import('../components/MaterialViewer'))

type Tab = 'overview' | 'courses' | 'quizzes' | 'grades' | 'progress'

type Course = {
  code: string
  title: string
  level: string
  program: string
  lecturer: string
  progress: number
  materials: number
  quizzesTotal: number
  quizzesDone: number
  avgScore: number
  studentCount: number
  color: string
}

type Quiz = {
  id: number
  title: string
  course: string
  questions: number
  timeLimit: number
  passingScore: number
  attempts: number
  dueDate: string
  openDate?: string
  closeDate?: string
  status: string
  difficulty: string
  tier?: string
  isLocked?: boolean
  isClosed?: boolean
}

type CompletedQuiz = {
  quizId?: number
  title: string
  course: string
  score: number
  outOf: number
  date: string
  grade: string
  passed: boolean
}

type QuizQuestion = {
  question: string
  options: string[]
  correct: string
}

type MaterialItem = {
  id: number
  name: string
  course: string
  lecturer: string
  size: string
  uploaded: string
  status: string
  path?: string
  file_url?: string
}

function mapCourse(course: Record<string, any>): Course {
  return {
    code: course.code,
    title: course.title,
    level: course.level,
    program: course.program,
    lecturer: course.lecturer,
    progress: course.progress ?? 0,
    materials: course.materials ?? 0,
    quizzesTotal: course.quizzes_total ?? 0,
    quizzesDone: course.quizzes_done ?? 0,
    avgScore: course.avg_score ?? 0,
    studentCount: course.student_count ?? 0,
    color: course.color,
  }
}

function inferTier(quiz: Record<string, any>): string {
  const raw = String(quiz.tier || '').trim()
  if (['Foundational', 'Intermediate', 'Mastery'].includes(raw)) return raw
  const title = String(quiz.title || '').toLowerCase()
  if (title.includes('intermediate')) return 'Intermediate'
  if (title.includes('mastery')) return 'Mastery'
  return 'Foundational'
}

function parseQuizDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const utcLike = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)
  const normalized = utcLike ? value : `${value}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.valueOf()) ? null : parsed
}

function mapQuiz(quiz: Record<string, any>): Quiz {
  const now = new Date()
  const openDt  = parseQuizDate(quiz.open_date)
  const closeDt = parseQuizDate(quiz.close_date)

  // SECURITY: Backend is_locked is the primary authoritative signal.
  // We also do a client-side date re-check as a secondary guard.
  // A scheduled quiz with no open_date should remain locked until the lecturer sets one.
  const isLocked = !!(
    quiz.is_locked ||
    (openDt ? openDt > now : false) ||
    (String(quiz.status || '').toLowerCase() === 'scheduled' && !openDt)
  )
  // Closed: availability window has ended
  const isClosed = !isLocked && !!(closeDt && closeDt < now)

  let status: string
  if (isLocked)        status = 'locked'
  else if (isClosed)   status = 'closed'
  else                 status = 'available'

  const tier = inferTier(quiz)
  return {
    id: quiz.id,
    title: quiz.title,
    course: quiz.course,
    // Schedule/format metadata (count, duration, pass score, due date) is safe to show
    // even while locked — only actual question text/answers are withheld by the backend.
    questions: quiz.questions ?? 0,
    timeLimit: quiz.time_limit,
    passingScore: quiz.passing_score,
    attempts: quiz.attempts,
    dueDate: quiz.due_date,
    openDate: quiz.open_date,
    closeDate: quiz.close_date,
    status,
    difficulty: isLocked ? undefined : quiz.difficulty,
    tier,
    isLocked,
    isClosed,
  }
}

function mapCompletedQuiz(quiz: Record<string, any>): CompletedQuiz {
  return {
    quizId: quiz.quiz_id,
    title: quiz.title,
    course: quiz.course,
    score: quiz.score,
    outOf: quiz.out_of,
    date: quiz.date,
    grade: quiz.grade,
    passed: quiz.passed,
  }
}

const navItems: { key: Tab; label: string; iconClass: string }[] = [
  { key: 'overview',  label: 'Overview',    iconClass: 'fa-house' },
  { key: 'courses',   label: 'My Courses',  iconClass: 'fa-book-open' },
  { key: 'quizzes',  label: 'Quizzes',     iconClass: 'fa-clipboard-list' },
  { key: 'grades',   label: 'My Grades',   iconClass: 'fa-award' },
  { key: 'progress', label: 'My Progress', iconClass: 'fa-chart-line' },
]

function ProgressRing({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 6
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-primary)" strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700"
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-foreground)" fontFamily="JetBrains Mono, monospace">
        {value}%
      </text>
    </svg>
  )
}

export default function Student({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      if (typeof window === 'undefined') return 'overview'
      const stored = window.localStorage.getItem('tmas-student-tab') as Tab | null
      return (stored as Tab) || 'overview'
    } catch {
      return 'overview'
    }
  })
  const [savedUser, setSavedUser] = useState<{ id?: string; name?: string; level?: string; program?: string } | null>(null)
  const [studentProfile, setStudentProfile] = useState({ level: '', program: '' })
  const [courses, setCourses] = useState<Course[]>([])
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([])
  const [completedQuizzes, setCompletedQuizzes] = useState<CompletedQuiz[]>([])
  const [materialsReaderCourse, setMaterialsReaderCourse] = useState<Course | null>(null)
  const [materialsReaderOpen, setMaterialsReaderOpen] = useState(false)
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [materialsListLoading, setMaterialsListLoading] = useState(false)
  const [activeMaterialId, setActiveMaterialId] = useState<number | null>(null)
  const [materialsError, setMaterialsError] = useState('')
  const [activeQuiz, setActiveQuiz] = useState<number | null>(null)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [lastAttempt, setLastAttempt] = useState<CompletedQuiz | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('All Tiers')
  const [quizLoading, setQuizLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [quizTimeLeft, setQuizTimeLeft] = useState<number | null>(null)
  // Authoritative deadline (epoch ms) reported by the server when the attempt was started.
  // Deriving the countdown from this instead of a locally-reset counter means refreshing
  // the page (or the tab losing focus) can't grant a student extra time.
  const [quizExpiresAt, setQuizExpiresAt] = useState<number | null>(null)
  const [quizTimedOut, setQuizTimedOut] = useState(false)
  const [quizForfeited, setQuizForfeited] = useState(false)
  const quizAnswersRef = useRef<Record<number, string>>({})
  const isAutoSubmittingRef = useRef(false)

  useEffect(() => {
    quizAnswersRef.current = quizAnswers
  }, [quizAnswers])

  const [readerSearchQuery, setReaderSearchQuery] = useState('')
  const [readerFontSize, setReaderFontSize] = useState<'text-sm' | 'text-base' | 'text-lg' | 'text-xl'>('text-sm')
  const [readerTheme, setReaderTheme] = useState<'default' | 'sepia' | 'dark'>('default')
  const [flippedFlashcards, setFlippedFlashcards] = useState<Record<number, boolean>>({})
  const [readMaterials, setReadMaterials] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('tmas-read-materials') || '{}')
    } catch {
      return {}
    }
  })
  // Per-course read counts from API: { 'COMP 401': 3, ... }
  const [courseReadProgress, setCourseReadProgress] = useState<Record<string, number>>({})

  // Load reading progress from Supabase and merge with localStorage cache
  const loadReadingProgress = async (studentId: string) => {
    if (!studentId) return
    try {
      const res = await fetch(`${API_BASE}/api/materials/reading-progress?student_id=${encodeURIComponent(studentId)}`)
      if (!res.ok) return
      const data = await res.json()
      const ids: number[] = data.read_ids || []
      const cProgress: Record<string, number> = data.course_progress || {}
      setCourseReadProgress(cProgress)
      if (ids.length > 0) {
        setReadMaterials(prev => {
          const merged: Record<string, boolean> = { ...prev }
          ids.forEach(id => { merged[String(id)] = true })
          try { localStorage.setItem('tmas-read-materials', JSON.stringify(merged)) } catch {}
          return merged
        })
      }
    } catch { /* silent — localStorage copy remains */ }
  }

  // Called by MaterialViewer once real scroll-depth + time-on-page telemetry crosses the
  // "actually read it" threshold (see backend /materials/{id}/progress) — not on mere open.
  const markMaterialCompleted = (materialId: number, studentId?: string) => {
    setReadMaterials(prev => {
      const next = { ...prev, [String(materialId)]: true }
      try { localStorage.setItem('tmas-read-materials', JSON.stringify(next)) } catch {}
      return next
    })
    const sid = studentId || savedUser?.id
    if (sid) loadReadingProgress(sid)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedUser = JSON.parse(localStorage.getItem('tmas-user') || 'null') as { id?: string; name?: string; level?: string; program?: string } | null
    setSavedUser(storedUser)
    setStudentProfile({
      level: storedUser?.level ?? '',
      program: storedUser?.program ?? '',
    })
    // Load reading progress from Supabase, merged with localStorage cache
    if (storedUser?.id) loadReadingProgress(storedUser.id)
    try {
      const storedTab = window.localStorage.getItem('tmas-student-tab') as Tab | null
      if (storedTab) setTab(storedTab as Tab)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('tmas-student-tab', tab)
    } catch {}
  }, [tab])

  const studentName = typeof savedUser?.name === 'string' ? savedUser.name : 'Student'
  const studentLevelLabel = studentProfile.level || 'Level 200'
  let studentInitials = ''
  for (const rawPart of studentName.split(' ')) {
    const part = rawPart.trim()
    if (!part) continue
    studentInitials += part[0]
    if (studentInitials.length >= 2) break
  }
  studentInitials = studentInitials.slice(0, 2).toUpperCase()

  const loadStudentData = async (isFirstLoad = false) => {
    if (isFirstLoad) setLoading(true)
    setError('')

    try {
      const studentId = savedUser?.id || ''
      const params = new URLSearchParams()
      params.set('level', studentProfile.level)
      if (studentProfile.program) params.set('program', studentProfile.program)
      if (studentId) params.set('student_id', studentId)

      const [coursesRes, availableRes, completedRes] = await Promise.all([
        fetch(`${API_BASE}/api/courses?${params.toString()}`),
        fetch(`${API_BASE}/api/quizzes/available?${params.toString()}`),
        fetch(`${API_BASE}/api/quizzes/completed?${params.toString()}`),
      ])

      if (!coursesRes.ok || !availableRes.ok || !completedRes.ok) {
        throw new Error('Failed to load student dashboard data')
      }

      const coursesData = await coursesRes.json()
      const availableData = await availableRes.json()
      const completedData = await completedRes.json()

      setCourses((coursesData.courses ?? []).map(mapCourse))
      setAvailableQuizzes((availableData.quizzes ?? []).map(mapQuiz))
      setCompletedQuizzes((completedData.quizzes ?? []).map(mapCompletedQuiz))
    } catch (fetchError) {
      if (isFirstLoad) setError(fetchError instanceof Error ? fetchError.message : 'Unable to load dashboard data')
    } finally {
      if (isFirstLoad) setLoading(false)
    }
  }

  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; type?: string; read?: boolean }>>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [mobileReaderTab, setMobileReaderTab] = useState<'list' | 'doc'>('list')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const seenNotifIdsRef = useRef<Set<string>>(new Set())
  const isInitialNotifLoadRef = useRef(true)

  useEffect(() => {
    if (!studentProfile.level) {
      if (savedUser) {
        setError('Student profile is incomplete. Please register with a valid academic level.')
        setLoading(false)
      }
      return
    }

    // Initial load with spinner
    loadStudentData(true)

    async function pollNotificationsOnly() {
      try {
        const notifRes = await fetch(`${API_BASE}/api/notifications?role=student`)
        if (notifRes.ok) {
          const data = await notifRes.json()
          const list = data.notifications || []
          setNotifications(list)

          let hasNewNotif = false
          for (const n of list) {
            if (!seenNotifIdsRef.current.has(n.id)) {
              seenNotifIdsRef.current.add(n.id)
              if (!isInitialNotifLoadRef.current) {
                hasNewNotif = true
                try {
                  const { triggerWebPushNotification, playNotificationChime } = await import('../utils/notifications')
                  triggerWebPushNotification(n.title, { body: n.message })
                  playNotificationChime()
                } catch {}
              }
            }
          }
          if (isInitialNotifLoadRef.current) {
            isInitialNotifLoadRef.current = false
          } else if (hasNewNotif) {
            // Silently refresh dashboard data when a new notification arrives
            loadStudentData(false)
          }
        }
      } catch {}
    }

    pollNotificationsOnly()
    const notifInterval = setInterval(pollNotificationsOnly, 12000)

    // ── Quiz availability auto-refresh ──────────────────────────────────────
    // Re-fetch quiz data every 60 seconds so quizzes auto-unlock when their
    // open_date arrives without requiring the student to manually reload.
    async function refreshQuizAvailability() {
      try {
        const sid = savedUser?.id || ''
        const p = new URLSearchParams()
        p.set('level', studentProfile.level)
        if (studentProfile.program) p.set('program', studentProfile.program)
        if (sid) p.set('student_id', sid)
        const [availableRes, completedRes] = await Promise.all([
          fetch(`${API_BASE}/api/quizzes/available?${p.toString()}`),
          fetch(`${API_BASE}/api/quizzes/completed?${p.toString()}`),
        ])
        if (availableRes.ok && completedRes.ok) {
          const availableData = await availableRes.json()
          const completedData = await completedRes.json()
          setAvailableQuizzes((availableData.quizzes ?? []).map(mapQuiz))
          setCompletedQuizzes((completedData.quizzes ?? []).map(mapCompletedQuiz))
        }
      } catch { /* silent — don't interrupt the student */ }
    }
    const quizInterval = setInterval(refreshQuizAvailability, 60_000)

    return () => {
      clearInterval(notifInterval)
      clearInterval(quizInterval)
    }
  }, [studentProfile.level, studentProfile.program, savedUser])

  useEffect(() => {
    async function loadQuizQuestions() {
      if (activeQuiz === null) {
        setQuizQuestions([])
        setQuizExpiresAt(null)
        setQuizTimedOut(false)
        return
      }

      setQuizLoading(true)
      setError('')
      setQuizTimedOut(false)
      setQuizForfeited(false)

      try {
        const studentId = savedUser?.id || ''

        // Step 1: Register the attempt start (records score=0 immediately)
        // This ensures a 0 is stored even if the student closes without submitting.
        const startRes = await fetch(`${API_BASE}/api/quizzes/${activeQuiz}/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ student_id: studentId }),
        })
        if (!startRes.ok) {
          const startErr = await startRes.json().catch(() => ({ detail: startRes.statusText }))
          throw new Error(startErr.detail || 'You have already used your attempt for this quiz.')
        }
        const startData = await startRes.json().catch(() => ({}))

        // The server is the source of truth for when this attempt expires (start time +
        // time limit), so the countdown survives refreshes instead of resetting to the
        // full duration every time this component re-mounts.
        const expiresAtMs = startData?.expires_at ? parseQuizDate(startData.expires_at)?.getTime() ?? null : null
        setQuizExpiresAt(expiresAtMs)
        setQuizTimeLeft(expiresAtMs !== null ? Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)) : null)

        // Step 2: Load the quiz questions
        const quizRes = await fetch(`${API_BASE}/api/quizzes/${activeQuiz}?level=${encodeURIComponent(studentProfile.level)}&program=${encodeURIComponent(studentProfile.program)}&student_id=${encodeURIComponent(studentId)}`)
        if (!quizRes.ok) {
          throw new Error('Failed to load quiz details')
        }

        const quizData = await quizRes.json()
        try {
          console.debug('Loaded quizData:', quizData)
        } catch {}

        const safeQuestions = Array.isArray(quizData.questions)
          ? quizData.questions.map((qq: any, idx: number) => ({
              question: String(qq?.question ?? qq?.text ?? `Question ${idx + 1}`),
              options: Array.isArray(qq?.options) ? qq.options.map((opt: any) => typeof opt === 'string' ? opt : String(opt?.text ?? opt?.value ?? JSON.stringify(opt))) : [],
              correct: String(qq?.answer ?? qq?.correct ?? '').trim(),
            }))
          : []

        setQuizQuestions(safeQuestions)
        setQuizAnswers({})
        setCurrentQ(0)
        isAutoSubmittingRef.current = false
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load quiz details')
        setActiveQuiz(null)
      } finally {
        setQuizLoading(false)
      }
    }

    if (studentProfile.level && studentProfile.program) {
      loadQuizQuestions()
    }
  }, [activeQuiz, studentProfile.level, studentProfile.program])

  const visibleCourses = useMemo(() => {
    return courses
  }, [courses])

  const visibleQuizzes = useMemo(() => {
    return availableQuizzes
  }, [availableQuizzes])

  const availableQuizzesCount = useMemo(() => visibleQuizzes.filter(q => q.status === 'available').length, [visibleQuizzes])
  const publishedQuizzesCount = useMemo(() => visibleQuizzes.length, [visibleQuizzes])
  const completedQuizzesCount = useMemo(() => completedQuizzes.length, [completedQuizzes])

  const activeQuizQuestions = useMemo(() => Array.isArray(quizQuestions) ? quizQuestions : [], [quizQuestions])

  const overallProgress = useMemo(() => {
    return visibleCourses.length ? Math.round(visibleCourses.reduce((s, c) => s + c.progress, 0) / visibleCourses.length) : 0
  }, [visibleCourses])

  const selectedQuiz = activeQuiz !== null ? visibleQuizzes.find(q => q.id === activeQuiz) : undefined

  const handleSubmitQuiz = async () => {
    if (activeQuiz === null || quizSubmitted || isAutoSubmittingRef.current) return
    setQuizLoading(true)
    isAutoSubmittingRef.current = true
    const student = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : null
    let attempt: CompletedQuiz | null = null

    try {
      const payload = { student_id: student?.id || '', answers: quizAnswersRef.current }
      const res = await fetch(`${API_BASE}/api/quizzes/${activeQuiz}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        const attemptRecord: CompletedQuiz = {
          quizId: activeQuiz,
          title: data.quiz?.title ?? selectedQuiz?.title ?? 'Quiz Attempt',
          course: data.quiz?.course ?? selectedQuiz?.course ?? '',
          score: data.attempt?.score ?? 0,
          outOf: data.attempt?.out_of ?? quizQuestions.length,
          date: data.attempt?.attempted_at ?? new Date().toISOString(),
          grade: data.attempt?.grade ?? '',
          passed: data.attempt?.passed ?? false,
        }
        attempt = attemptRecord
        setLastAttempt(attemptRecord)
        setCompletedQuizzes(prev => {
          const filtered = prev.filter(q => q.quizId !== activeQuiz)
          return [attemptRecord, ...filtered]
        })
        try {
          const { dispatchPushNotification } = await import('../utils/notifications')
          await dispatchPushNotification({
            title: 'Student Quiz Submission',
            message: `${savedUser?.name || 'A student'} submitted ${selectedQuiz?.title || 'a quiz'} (${attemptRecord.score}% score).`,
            target_role: 'lecturer',
            type: 'info',
          })
        } catch {}
        await loadStudentData()
      } else if (res.status === 403) {
        // The server enforces the time limit / open-close window independently of the
        // client-side countdown. If it rejects the submission, the attempt has already
        // been recorded as missed (score 0) — reflect that instead of grading locally.
        const errBody = await res.json().catch(() => ({}))
        setQuizTimedOut(true)
        const missedRecord: CompletedQuiz = {
          quizId: activeQuiz,
          title: selectedQuiz?.title ?? 'Quiz Attempt',
          course: selectedQuiz?.course ?? '',
          score: 0,
          outOf: quizQuestions.length,
          date: new Date().toISOString(),
          grade: 'F',
          passed: false,
        }
        attempt = missedRecord
        setLastAttempt(missedRecord)
        setError(errBody.detail || 'Time limit exceeded. This attempt has been recorded as missed.')
        setCompletedQuizzes(prev => {
          const filtered = prev.filter(q => q.quizId !== activeQuiz)
          return [missedRecord, ...filtered]
        })
        await loadStudentData()
      } else {
        console.warn('Submit failed', await res.text())
      }
    } catch (err) {
      console.error('Submit request failed', err)
    } finally {
      setQuizSubmitted(true)
      setQuizLoading(false)
      isAutoSubmittingRef.current = false
    }
  }

  // Leaving the assessment screen (switching tabs/apps, closing the window) is how a
  // student could copy questions out to a third-party solver, so it immediately forfeits
  // the attempt with a score of 0 rather than leaving it open to resume. Uses sendBeacon
  // so the request has the best chance of completing even as the tab is backgrounded/closing.
  const forfeitQuizForLeaving = useCallback(() => {
    if (activeQuiz === null || quizSubmitted || isAutoSubmittingRef.current) return
    isAutoSubmittingRef.current = true

    const student = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : null
    const payload = JSON.stringify({ student_id: student?.id || '' })
    const url = `${API_BASE}/api/quizzes/${activeQuiz}/forfeit`
    try {
      const blob = new Blob([payload], { type: 'application/json' })
      if (!navigator.sendBeacon(url, blob)) {
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
      }
    } catch {
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
    }

    const forfeitRecord: CompletedQuiz = {
      quizId: activeQuiz,
      title: selectedQuiz?.title ?? 'Quiz Attempt',
      course: selectedQuiz?.course ?? '',
      score: 0,
      outOf: quizQuestions.length,
      date: new Date().toISOString(),
      grade: 'F',
      passed: false,
    }
    setLastAttempt(forfeitRecord)
    setCompletedQuizzes(prev => {
      const filtered = prev.filter(q => q.quizId !== activeQuiz)
      return [forfeitRecord, ...filtered]
    })
    setQuizForfeited(true)
    setQuizSubmitted(true)
  }, [activeQuiz, quizSubmitted, selectedQuiz, quizQuestions.length])

  useEffect(() => {
    if (activeQuiz === null || quizSubmitted) return

    function handleVisibilityChange() {
      if (document.hidden) forfeitQuizForLeaving()
    }
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      forfeitQuizForLeaving()
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [activeQuiz, quizSubmitted, forfeitQuizForLeaving])

  // Fallback for the rare case the server didn't return an authoritative expiry
  // (e.g. an untimed quiz, or an older in-progress attempt): fall back to a plain countdown.
  useEffect(() => {
    if (activeQuiz !== null && quizExpiresAt === null && selectedQuiz && selectedQuiz.timeLimit > 0 && quizTimeLeft === null) {
      setQuizTimeLeft(selectedQuiz.timeLimit * 60)
    }
  }, [activeQuiz, selectedQuiz, quizTimeLeft, quizExpiresAt])

  useEffect(() => {
    if (activeQuiz === null || quizSubmitted) return
    if (quizExpiresAt === null && (quizTimeLeft === null || quizTimeLeft <= 0)) return

    const tick = () => {
      if (quizExpiresAt !== null) {
        const remaining = Math.max(0, Math.round((quizExpiresAt - Date.now()) / 1000))
        setQuizTimeLeft(remaining)
        if (remaining <= 0) {
          handleSubmitQuiz()
        }
      } else {
        setQuizTimeLeft(prev => {
          if (prev === null) return null
          if (prev <= 1) {
            handleSubmitQuiz()
            return 0
          }
          return prev - 1
        })
      }
    }

    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [activeQuiz, quizExpiresAt, quizTimeLeft, quizSubmitted])

  const visibleCompletedQuizzes = useMemo(() => {
    return completedQuizzes
  }, [completedQuizzes])

  const avgScore = useMemo(() => {
    return visibleCompletedQuizzes.length ? Math.round(visibleCompletedQuizzes.reduce((s, q) => s + q.score, 0) / visibleCompletedQuizzes.length) : 0
  }, [visibleCompletedQuizzes])

  const highestScore = visibleCompletedQuizzes.length ? Math.max(...visibleCompletedQuizzes.map(q => q.score)) : 0
  const passedQuizCount = visibleCompletedQuizzes.filter(q => q.passed).length
  const quizProgress = visibleCourses.length ? Math.round((visibleCourses.reduce((sum, course) => sum + course.progress, 0) / visibleCourses.length)) : 0
  const gpaEquivalent = avgScore ? Number(Math.min(4, Math.max(0, (avgScore / 25))).toFixed(1)) : 0

  // Real, per-item achievements sourced from actual completed quiz attempts —
  // not generic index-matched placeholder text.
  const recentAchievements = useMemo(() => {
    type Achievement = { icon: string; title: string; detail: string; date?: string }
    const items: Achievement[] = []
    const sorted = [...visibleCompletedQuizzes].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const passedRecent = sorted.filter(q => q.passed).slice(0, 3)
    for (const q of passedRecent) {
      items.push({
        icon: 'trophy',
        title: `Passed ${q.title}`,
        detail: `${q.course} • Scored ${q.score}%`,
        date: q.date,
      })
    }
    if (items.length === 0 && sorted.length > 0) {
      const latest = sorted[0]
      items.push({
        icon: 'book',
        title: `Attempted ${latest.title}`,
        detail: `${latest.course} • Scored ${latest.score}%`,
        date: latest.date,
      })
    }
    if (items.length === 0) {
      items.push({ icon: 'target', title: 'No achievements yet', detail: 'Complete a quiz to see your progress here.' })
    }
    return items
  }, [visibleCompletedQuizzes])

  if (activeQuiz !== null && !quizSubmitted) {
    if (quizLoading) {
      return (
        <div className="min-h-screen bg-background font-sans flex items-center justify-center p-8">
          <div className="text-center rounded-3xl border border-border bg-card p-10">
            <p className="text-sm text-muted-foreground">Loading quiz details...</p>
          </div>
        </div>
      )
    }

    const q = activeQuizQuestions[currentQ]
    if (!q) {
      return (
        <div className="min-h-screen bg-background font-sans flex items-center justify-center p-8">
          <div className="text-center rounded-3xl border border-border bg-card p-10">
            <p className="text-sm text-muted-foreground">No quiz questions available.</p>
            <button onClick={() => setActiveQuiz(null)} className="mt-4 bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold">Back to Dashboard</button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background font-sans flex flex-col">
        <div className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white text-sm font-bold font-mono">T</span>
            </div>
            <div>
              <p className="font-semibold text-sm">{selectedQuiz?.title ?? 'Quiz Attempt'}</p>
              <p className="text-primary-foreground/70 text-xs">{selectedQuiz?.course ?? 'Course'} <i className="fa-solid fa-chevron-right text-[10px] mx-0.5 opacity-50" /> Question {currentQ + 1} of {activeQuizQuestions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`rounded-lg px-4 py-1.5 text-sm font-mono font-bold flex items-center gap-2 ${quizTimeLeft !== null && quizTimeLeft <= 60 ? 'bg-danger text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-white/10'}`}>
              <Icon name="timer" />
              <span>{quizTimeLeft !== null ? `${Math.floor(quizTimeLeft / 60)}:${String(quizTimeLeft % 60).padStart(2, '0')}` : `${selectedQuiz?.timeLimit ?? 0} min`}</span>
            </div>
            <button
              onClick={() => {
                if (window.confirm('Leaving now will forfeit this quiz and record a score of 0. Are you sure you want to exit?')) {
                  forfeitQuizForLeaving()
                }
              }}
              className="text-primary-foreground/70 hover:text-primary-foreground text-sm"
            >
              Exit
            </button>
          </div>
        </div>

        <div className="bg-danger/10 border-b border-danger/20 text-danger text-xs font-semibold px-6 py-2 flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation" />
          Do not switch tabs, minimize, or leave this screen — doing so immediately forfeits this attempt with a score of 0.
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex gap-1.5">
                  {activeQuizQuestions.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i < currentQ ? 'bg-success w-6' : i === currentQ ? 'bg-primary w-10' : 'bg-muted w-6'}`} />
                  ))}
                </div>
              </div>

              <div className="mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question {currentQ + 1} of {activeQuizQuestions.length}</span>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-8 leading-relaxed">{q.question}</h2>

              <div className="space-y-3 mb-8">
                {Array.isArray(q.options) && q.options.length > 0 ? (
                  q.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setQuizAnswers(a => ({ ...a, [currentQ]: opt }))}
                      className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${quizAnswers[currentQ] === opt ? 'border-primary bg-secondary text-primary font-semibold' : 'border-border hover:border-primary/40 hover:bg-muted/50 text-foreground'}`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${quizAnswers[currentQ] === opt ? 'border-primary bg-primary' : 'border-border'}`}>
                        {quizAnswers[currentQ] === opt && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                      </div>
                      {opt}
                    </button>
                  ))
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">Your answer</label>
                    <textarea
                      value={quizAnswers[currentQ] ?? ''}
                      onChange={e => setQuizAnswers(a => ({ ...a, [currentQ]: e.target.value }))}
                      rows={4}
                      className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Type your answer here..."
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentQ(q => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="px-6 py-3 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <i className="fa-solid fa-arrow-left" /> Previous
                </button>
                {currentQ < activeQuizQuestions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQ(q => q + 1)}
                    disabled={!quizAnswers[currentQ]}
                    className="px-6 py-3 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-950 transition-colors"
                  >
                    Next <i className="fa-solid fa-arrow-right" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmitQuiz}
                    disabled={!quizAnswers[currentQ] || quizLoading}
                    className="px-6 py-3 bg-success text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {quizLoading ? 'Submitting...' : (
                      <>
                        <Icon name="check" /> Submit Quiz
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (quizSubmitted) {
    // Normalize answers for comparison: lowercase + trim, so 'Halt' matches 'halt'
    const normalizeAns = (s: string) => (s || '').toLowerCase().trim()
    const correct = Object.values(quizAnswers).filter((ans, i) => {
      const expected = normalizeAns(activeQuizQuestions[i]?.correct)
      const given = normalizeAns(ans)
      if (!given) return false
      // Exact normalized match
      if (expected === given) return true
      // Partial / contains match for fill-in-blank and short-answer
      if (expected.includes(given) || given.includes(expected)) return true
      return false
    }).length
    const score = lastAttempt?.score ?? Math.round((correct / activeQuizQuestions.length) * 100)
    const outOf = lastAttempt?.outOf ?? activeQuizQuestions.length
    const passed = lastAttempt?.passed ?? score >= (selectedQuiz?.passingScore ?? 60)
    const missedQuestions = activeQuizQuestions
      .map((q, idx) => ({ ...q, studentAns: quizAnswers[idx], idx }))
      .filter(q => {
        const expected = normalizeAns(q.correct)
        const given = normalizeAns(q.studentAns)
        if (!given) return true
        if (expected === given) return false
        if (expected.includes(given) || given.includes(expected)) return false
        return true
      })

    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl text-center space-y-6">
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-10 shadow-2xl">
            <div className="text-5xl mb-4">{quizTimedOut || quizForfeited ? <Icon name="timer" size={48} /> : score >= 60 ? <Icon name="celebrate" size={48} /> : <Icon name="book" size={48} />}</div>
            <h2 className="font-display text-2xl sm:text-3xl text-foreground mb-2">{quizForfeited ? 'Attempt Forfeited' : quizTimedOut ? 'Time Limit Exceeded' : score >= 60 ? 'Quiz Passed!' : 'Keep Studying'}</h2>
            <p className="text-muted-foreground text-sm mb-6">{selectedQuiz?.title ?? 'Quiz Attempt'} <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" /> {selectedQuiz?.course ?? 'Course'}</p>
            {quizForfeited && (
              <div className="mb-6 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm px-4 py-3 text-left">
                You left the assessment screen while this quiz was in progress, so it has been forfeited and recorded with a score of 0%. Contact your lecturer if you believe this is an error.
              </div>
            )}
            {quizTimedOut && !quizForfeited && (
              <div className="mb-6 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm px-4 py-3 text-left">
                Your time ran out before this attempt was submitted, so it has been recorded as missed with a score of 0%. Contact your lecturer if you believe this is an error.
              </div>
            )}
            <div className="flex justify-center mb-6">
              <ProgressRing value={score} size={96} />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Correct', val: `${correct}/${activeQuizQuestions.length}` },
                { label: 'Score', val: `${score}%` },
                { label: 'Result', val: score >= 60 ? 'PASS' : 'FAIL' },
              ].map((s, i) => (
                <div key={i} className="bg-muted rounded-xl py-3">
                  <p className="text-base sm:text-lg font-bold font-mono text-foreground">{s.val}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* ── AI Remediation & Interactive Flashcards Section ── */}
            {missedQuestions.length > 0 && (
              <div className="mt-8 pt-6 border-t border-border text-left space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Icon name="robot" size={16} />
                    <span>AI Remediation & Flashcards ({missedQuestions.length})</span>
                  </h3>
                  <span className="text-xs text-muted-foreground">Click card to flip</span>
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {missedQuestions.map(q => {
                    const isFlipped = !!flippedFlashcards[q.idx]
                    return (
                      <div
                        key={q.idx}
                        onClick={() => setFlippedFlashcards(prev => ({ ...prev, [q.idx]: !prev[q.idx] }))}
                        className="cursor-pointer rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-all hover:border-primary/40 shadow-sm"
                      >
                        {!isFlipped ? (
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">Question #{q.idx + 1} • Tap to view explanation</span>
                            <p className="mt-2 text-xs font-semibold text-foreground">{q.question}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-danger font-medium">Your Answer: {q.studentAns || 'Unanswered'}</span>
                              <span className="text-muted-foreground"><i className="fa-solid fa-circle text-[6px] opacity-40" /></span>
                              <span className="text-success font-medium">Correct: {q.correct}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <span className="text-[10px] uppercase font-bold tracking-wider bg-accent/20 text-accent px-2 py-0.5 rounded-full"><i className="fa-solid fa-lightbulb mr-1" />AI Concept Key & Explanation</span>
                            <p className="text-xs text-foreground font-medium leading-relaxed mt-1">
                              Explanation: This question tests key concepts in {selectedQuiz?.course || 'the course'}. {q.correct} is the accurate answer because it directly satisfies system requirements and core course topics.
                            </p>
                            <p className="text-[11px] text-muted-foreground italic">Tap again to view question</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <button onClick={() => { setActiveQuiz(null); setQuizSubmitted(false); setQuizTimedOut(false); setQuizForfeited(false); setCurrentQ(0); setQuizAnswers({}); setFlippedFlashcards({}) }} className="w-full mt-6 bg-primary hover:bg-blue-950 text-white font-semibold py-3.5 rounded-xl transition-colors">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans relative">

      {/* ── Mobile Overlay ── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 bg-sidebar flex flex-col border-r border-white/5 shrink-0 transition-transform duration-200 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{ width: '15rem' }}>
        <div className="px-5 py-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold font-mono">T</span>
            </div>
            <div>
              <p className="text-sidebar-foreground font-semibold text-sm">TMAS</p>
              <p className="text-sidebar-muted text-xs">Meridian University</p>
            </div>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden text-sidebar-muted hover:text-sidebar-foreground p-1">
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <p className="text-sidebar-muted text-xs font-semibold uppercase tracking-widest px-3 mb-3">Student Portal</p>
          <nav className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => {
                  setTab(item.key)
                  setMobileNavOpen(false)
                }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === item.key ? 'bg-primary text-white' : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-white/5'}`}
              >
                <i className={`fa-solid ${item.iconClass} w-4`} />
                {item.label}
                {item.key === 'quizzes' && (availableQuizzesCount > 0 || publishedQuizzesCount > 0) && (
                  <span className="ml-auto bg-accent text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {availableQuizzesCount > 0 ? availableQuizzesCount : publishedQuizzesCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{studentInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-foreground text-xs font-semibold truncate">{studentName}</p>
              <p className="text-sidebar-muted text-xs truncate">{studentLevelLabel} Student</p>
              <p className="text-sidebar-muted text-[11px] mt-1 truncate">{publishedQuizzesCount} quiz{publishedQuizzesCount === 1 ? '' : 'zes'} published</p>
            </div>
            <button onClick={() => {
              localStorage.removeItem('tmas-token')
              localStorage.removeItem('tmas-user')
              onNavigate('login')
            }} className="text-sidebar-muted hover:text-sidebar-foreground transition-colors" title="Logout">
              <i className="fa-solid fa-right-from-bracket" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden text-muted-foreground hover:text-foreground p-1">
              <i className="fa-solid fa-bars text-lg" />
            </button>
            <h1 className="text-foreground font-semibold text-sm">
              {tab === 'overview' ? 'My Dashboard' : tab === 'courses' ? 'My Enrolled Courses' : tab === 'quizzes' ? 'Quizzes' : tab === 'grades' ? 'My Grades' : 'Learning Progress'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const { requestPushPermission, triggerWebPushNotification, playNotificationChime } = await import('../utils/notifications')
                const granted = await requestPushPermission()
                triggerWebPushNotification('TMAS Push Notification System Active!', {
                  body: 'Web Push alerts and real-time notification engine are fully working on your device.',
                })
                playNotificationChime()
                alert(granted ? 'Browser Push Notification Dispatched! Check your desktop/mobile notifications.' : 'Sound chime played! (Enable browser notification permissions to see desktop popups).')
              }}
              className="flex items-center gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-full transition-colors"
              title="Test Instant Web Push Notification"
            >
              <i className="fa-solid fa-bolt" />
              <span>Test Push</span>
            </button>
            <span className="text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full font-semibold">{studentLevelLabel}</span>
            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center transition-transform hover:scale-105 shadow-sm cursor-pointer"
              title="View Student Profile"
            >
              <span className="text-white text-xs font-bold">{studentName.slice(0, 2).toUpperCase()}</span>
            </button>
          </div>
        </header>

        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          user={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') || { name: studentName, email: '', role: 'student' } : null}
          onLogout={() => {
            localStorage.removeItem('tmas-token')
            localStorage.removeItem('tmas-user')
            onNavigate('login')
          }}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="mb-6 rounded-3xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">Loading student dashboard...</p>
            </div>
          )}
          {error && (
            <div className="mb-6 rounded-3xl border border-danger/30 bg-danger/5 p-6 text-center">
              <p className="text-sm font-semibold text-danger">{error}</p>
              <p className="text-xs text-danger/80 mt-2">Please refresh or check your backend server.</p>
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-primary rounded-2xl p-6 text-primary-foreground">
                <p className="text-primary-foreground/70 text-sm mb-1">Good morning,</p>
                <h2 className="font-display text-3xl text-white mb-2">{studentName}</h2>
                <p className="text-primary-foreground/70 text-sm">
                  You have <span className="text-accent font-semibold">{publishedQuizzesCount} quizzes</span> published and your overall progress is <span className="text-white font-semibold">{overallProgress}%</span>.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Enrolled Courses', val: String(visibleCourses.length), sub: studentProfile.level, icon: 'book-open' },
                  { label: 'Published Quizzes', val: String(publishedQuizzesCount), sub: 'Upcoming + open', icon: 'clipboard-question' },
                  { label: 'Avg Quiz Score', val: `${avgScore}%`, sub: `${completedQuizzesCount} completed`, icon: 'chart-line' },
                  { label: 'Overall Progress', val: `${overallProgress}%`, sub: 'This semester', icon: 'graduation-cap' },
                ].map((s, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5">
                    <div className="inline-flex p-2 rounded-xl bg-muted mb-3 text-muted-foreground">
                      <i className={`fa-solid fa-${s.icon}`} />
                    </div>
                    <p className="text-2xl font-bold font-mono text-foreground">{s.val}</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-foreground">Course Progress</h3>
                    <button onClick={() => setTab('courses')} className="text-xs text-primary hover:underline">View all</button>
                  </div>
                  <div className="space-y-4">
                    {visibleCourses.map((c, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary">{c.code}</span>
                            <span className="text-sm text-foreground truncate max-w-36">{c.title}</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-foreground">{c.progress}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-700"
                            style={{ width: `${c.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-foreground">Upcoming Quizzes</h3>
                    <button onClick={() => setTab('quizzes')} className="text-xs text-primary hover:underline">View all</button>
                  </div>
                  <div className="space-y-3">
                    {visibleQuizzes.map(q => {
                      const isAvailable = q.status === 'available' && !q.isLocked
                      const isOverdue = q.status === 'overdue'
                      const isScheduled = q.status === 'scheduled' || q.isLocked
                      const hasOpenDate = !!q.openDate

                      return (
                        <div key={q.id} className={`flex items-center gap-4 p-4 rounded-xl border ${isOverdue ? 'border-danger/25 bg-danger/5' : 'border-border hover:border-primary/30 hover:bg-muted/30'} transition-colors`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs font-bold text-primary">{q.course}</span>
                              {isOverdue && <span className="text-xs text-danger font-semibold">Overdue</span>}
                              {q.tier && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{q.tier}</span>}
                            </div>
                            <p className="text-sm text-foreground font-medium truncate">{q.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {q.questions} questions
                              <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" />
                              {q.timeLimit ?? '–'} min
                              <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" />
                              Due {q.dueDate || 'TBD'}
                            </p>
                            {hasOpenDate && (
                              <p className="text-xs text-muted-foreground">Open from {q.openDate}</p>
                            )}
                            {q.closeDate && q.closeDate !== q.dueDate && (
                              <p className="text-xs text-muted-foreground">Closes {q.closeDate}</p>
                            )}
                          </div>
                          <button
                            onClick={() => isAvailable && setActiveQuiz(q.id)}
                            disabled={!isAvailable && !isOverdue}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${isOverdue ? 'bg-danger/10 text-danger hover:bg-danger/20' : isAvailable ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                          >
                            {isOverdue ? 'Late Submit' : isAvailable ? 'Start' : 'Not Open'}
                            {isAvailable && <i className="fa-solid fa-arrow-right text-xs ml-1" />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MY COURSES ── */}
          {tab === 'courses' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleCourses.map((c, i) => (
                <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-all group">
                  <div className={`h-20 bg-linear-to-br ${c.color} relative`}>
                    <div className="absolute inset-0 flex items-end p-4">
                      <div>
                        <span className="text-white/70 text-xs font-mono">{c.code}</span>
                        <h3 className="text-white font-semibold text-base leading-tight">{c.title}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{c.level}</span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{c.program || 'General'}</span>
                      <span className="text-xs text-muted-foreground">{c.lecturer}</span>
                    </div>
                    <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Course details</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{c.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Code: {c.code} <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" /> Level: {c.level}</p>
                    </div>
                    {/* ── 3 stat boxes: Students / Materials / Quizzes ── */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-muted/50 rounded-xl py-2.5 text-center">
                        <p className="text-base font-bold font-mono text-foreground">
                          {c.studentCount > 0 ? c.studentCount : <span className="text-muted-foreground text-xs">—</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">Students</p>
                      </div>
                      <div className="bg-muted/50 rounded-xl py-2.5 text-center">
                        <p className="text-base font-bold font-mono text-foreground">{c.materials}</p>
                        <p className="text-xs text-muted-foreground">Materials</p>
                      </div>
                      <div className="bg-muted/50 rounded-xl py-2.5 text-center">
                        <p className="text-base font-bold font-mono text-foreground">{c.quizzesTotal}</p>
                        <p className="text-xs text-muted-foreground">Quizzes</p>
                      </div>
                    </div>
                    {/* Avg score row */}
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="text-muted-foreground font-medium">Quizzes done:</span>
                      <span className="font-mono font-bold text-foreground">{c.quizzesDone}/{c.quizzesTotal}</span>
                      <span className="text-muted-foreground font-medium ml-4">Avg Score:</span>
                      <span className="font-mono font-bold text-foreground">{c.avgScore > 0 ? `${c.avgScore}%` : '—'}</span>
                    </div>
                    {(() => {
                      // Use API course_progress for accuracy; fall back to materials-list if reader is open
                      const courseMatsRead = (() => {
                        if (materialsReaderCourse?.code === c.code && materials.length > 0) {
                          // Reader is open for this course — use live in-memory count
                          return materials.filter(m => readMaterials[String(m.id)]).length
                        }
                        // Use server-provided per-course count (any matching key: 'COMP 401', 'COMP401', etc.)
                        const apiCount = Object.entries(courseReadProgress).find(
                          ([k]) => k.replace(/\s+/g, '').toLowerCase() === c.code.replace(/\s+/g, '').toLowerCase()
                        )?.[1] ?? 0
                        return Math.min(apiCount, c.materials)
                      })()
                      const matPct  = c.materials    > 0 ? Math.round((courseMatsRead  / c.materials)    * 100) : 0
                      const quizPct = c.quizzesTotal > 0 ? Math.round((c.quizzesDone  / c.quizzesTotal) * 100) : 0
                      const overall = c.materials > 0 && c.quizzesTotal > 0
                        ? Math.round((matPct + quizPct) / 2)
                        : c.materials > 0 ? matPct : quizPct
                      return (
                        <div className="space-y-3">
                          {/* Material reading progress */}
                          {c.materials > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                  <i className="fa-solid fa-book-open text-[10px] text-emerald-500" /> Materials Read
                                </span>
                                <span className="text-xs font-mono font-bold text-foreground">{courseMatsRead}/{c.materials}</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${matPct}%` }} />
                              </div>
                            </div>
                          )}
                          {/* Quiz completion progress */}
                          {c.quizzesTotal > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                  <i className="fa-solid fa-circle-check text-[10px] text-primary" /> Quizzes Done
                                </span>
                                <span className="text-xs font-mono font-bold text-foreground">{c.quizzesDone}/{c.quizzesTotal}</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${quizPct}%` }} />
                              </div>
                            </div>
                          )}
                          {/* Overall completion */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground font-medium">Overall Progress</span>
                              <span className="text-xs font-mono font-bold text-foreground">{overall}%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full bg-linear-to-r ${c.color} transition-all duration-700`} style={{ width: `${overall}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    <button
                      onClick={async () => {
                        setMaterialsReaderCourse(c)
                        setMaterialsReaderOpen(true)
                        setMaterials([])
                        setActiveMaterialId(null)
                        setMaterialsError('')
                        setMaterialsListLoading(true)

                        try {
                          const res = await fetch(`${API_BASE}/api/materials?course=${encodeURIComponent(c.code)}`)
                          if (!res.ok) throw new Error('Unable to load course materials')
                          const data = await res.json()
                          const mats = (data.materials || []) as MaterialItem[]
                          setMaterials(mats)
                          // Auto-open the first material — MaterialViewer's own scroll/time
                          // telemetry decides when it actually counts as read.
                          if (mats[0]) {
                            setActiveMaterialId(mats[0].id)
                          }
                          // Update per-course read count from local readMaterials
                          setCourseReadProgress(prev => ({
                            ...prev,
                            [c.code]: mats.filter(m => readMaterials[String(m.id)]).length,
                          }))
                        } catch (err) {
                          setMaterialsError(err instanceof Error ? err.message : 'Unable to load course materials')
                        } finally {
                          setMaterialsListLoading(false)
                        }
                      }}
                      className="mt-4 w-full bg-muted hover:bg-secondary text-foreground hover:text-primary font-medium py-2.5 rounded-xl text-sm transition-colors"
                    >
                      Open materials <i className="fa-solid fa-arrow-right ml-1" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── QUIZZES ── */}
          {tab === 'quizzes' && (
            <div className="space-y-8">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">3-Tier Assessment Quizzes</h3>
                    <p className="text-xs text-muted-foreground">Quizzes are categorized into Foundational, Intermediate, and Mastery tiers. Scheduled quizzes remain locked until open date.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Manual refresh — updates lock/unlock status without full page reload */}
                    <button
                      id="quiz-refresh-btn"
                      onClick={async () => {
                        const btn = document.getElementById('quiz-refresh-btn')
                        if (btn) btn.classList.add('animate-spin')
                        try {
                          const sid = savedUser?.id || ''
                          const p = new URLSearchParams()
                          p.set('level', studentProfile.level)
                          if (studentProfile.program) p.set('program', studentProfile.program)
                          if (sid) p.set('student_id', sid)
                          const [availableRes, completedRes] = await Promise.all([
                            fetch(`${API_BASE}/api/quizzes/available?${p.toString()}`),
                            fetch(`${API_BASE}/api/quizzes/completed?${p.toString()}`),
                          ])
                          if (availableRes.ok && completedRes.ok) {
                            const ad = await availableRes.json()
                            const cd = await completedRes.json()
                            setAvailableQuizzes((ad.quizzes ?? []).map(mapQuiz))
                            setCompletedQuizzes((cd.quizzes ?? []).map(mapCompletedQuiz))
                          }
                        } catch {}
                        if (btn) btn.classList.remove('animate-spin')
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-border bg-muted hover:bg-card text-muted-foreground hover:text-primary transition-colors"
                      title="Refresh quiz availability"
                    >
                      <i className="fa-solid fa-rotate-right text-xs" />
                    </button>
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-xl text-xs font-semibold">
                      {['All Tiers', 'Foundational', 'Intermediate', 'Mastery'].map(tier => (
                        <button
                          key={tier}
                          onClick={() => setSelectedTierFilter(tier)}
                          className={`px-3 py-1.5 rounded-lg transition-colors ${selectedTierFilter === tier ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {visibleQuizzes.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-10 text-center">
                    <i className="fa-solid fa-clipboard-question text-3xl text-muted-foreground/40 mb-3 block" />
                    <p className="text-sm font-medium text-foreground">No quizzes found for your current level and program.</p>
                    <p className="text-xs text-muted-foreground mt-2">Ask your lecturer to publish a quiz or check back later.</p>
                    <button
                      onClick={() => loadStudentData(false)}
                      className="mt-4 text-xs text-primary hover:underline"
                    >
                      <i className="fa-solid fa-rotate-right mr-1" /> Refresh now
                    </button>
                  </div>

                ) : (
                  <div className="space-y-6">
                    {['Foundational', 'Intermediate', 'Mastery']
                      .filter(tier => selectedTierFilter === 'All Tiers' || selectedTierFilter === tier)
                      .map(tierName => {
                        const tierQuizzes = visibleQuizzes.filter(q => (q.tier || 'Foundational') === tierName)
                        return (
                          <div key={tierName} className="space-y-3">
                            <div className="flex items-center gap-2 border-b border-border pb-2">
                              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-primary/10 text-primary">
                                {tierName === 'Foundational'
                                  ? <><i className="fa-solid fa-seedling text-emerald-500" /> Foundational Tier</>
                                  : tierName === 'Intermediate'
                                  ? <><i className="fa-solid fa-bolt text-amber-500" /> Intermediate Tier</>
                                  : <><i className="fa-solid fa-fire text-purple-500" /> Mastery Tier</>}
                              </span>
                              <span className="text-xs text-muted-foreground">({tierQuizzes.length} quiz{tierQuizzes.length === 1 ? '' : 'zes'})</span>
                            </div>

                            {tierQuizzes.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic px-4 py-3 bg-muted/20 rounded-xl border border-dashed border-border">
                                No {tierName.toLowerCase()} tier quizzes published yet.
                              </div>
                            ) : (
                              tierQuizzes.map(q => {
                                const now = new Date()
                                const openDt = q.openDate ? new Date(q.openDate) : null
                                // Trust q.isLocked (from backend). Client-side date re-check handles
                                // the edge case where a quiz unlocks mid-session (open_date just passed).
                                const renderLocked = q.isLocked || (openDt ? openDt > now : false)

                                return (
                                <div key={q.id} className={`bg-card border rounded-2xl transition-all shadow-xs ${
                                  renderLocked ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-orange-500/5' :
                                  q.isClosed   ? 'border-danger/30 bg-danger/5' :
                                  'border-border hover:border-primary/30 hover:shadow-md'
                                }`}>

                                  {/* ── LOCKED: Show ONLY course/tier/opening time — hide ALL quiz details ── */}
                                  {renderLocked ? (
                                    <div className="p-6">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex-1 space-y-3">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-primary">{q.course}</span>
                                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                              q.tier === 'Mastery'      ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20' :
                                              q.tier === 'Intermediate' ? 'bg-amber-500/10  text-amber-600  border border-amber-500/20'  :
                                              'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                            }`}>
                                              {q.tier === 'Mastery'      ? <><i className="fa-solid fa-fire" /> Mastery</>      :
                                               q.tier === 'Intermediate' ? <><i className="fa-solid fa-bolt" /> Intermediate</> :
                                               <><i className="fa-solid fa-seedling" /> Foundational</>}
                                            </span>
                                            <span className="text-xs font-bold text-amber-700 bg-amber-500/10 border border-amber-500/30 px-3 py-0.5 rounded-full inline-flex items-center gap-1.5">
                                              <i className="fa-solid fa-lock text-amber-600 text-[10px]" />
                                              Upcoming
                                            </span>
                                          </div>
                                          {/* Title blurred — prevent content sniffing */}
                                          <h4 className="font-display font-bold text-foreground/50 text-base select-none" style={{ filter: 'blur(3px)' }}>
                                            {q.title || 'Scheduled Quiz'}
                                          </h4>
                                          <p className="text-xs text-muted-foreground">
                                            <i className="fa-solid fa-shield-halved mr-1 text-amber-600/70" />
                                            Quiz content is hidden until the opening time to protect assessment integrity.
                                          </p>
                                          {q.openDate ? (
                                            <div className="flex items-center gap-2 text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 text-xs font-semibold w-fit">
                                              <i className="fa-solid fa-calendar-check text-amber-600" />
                                              Opens: {new Date(q.openDate).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 text-muted-foreground bg-muted/60 rounded-xl px-4 py-2 text-xs font-medium w-fit">
                                              <i className="fa-solid fa-hourglass-half" />
                                              Opening time to be announced by lecturer
                                            </div>
                                          )}
                                          {/* Format details are safe to preview even while locked — only the
                                              questions themselves stay hidden until the quiz opens. */}
                                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                                            {q.questions > 0 && (
                                              <span className="inline-flex items-center gap-1.5"><i className="fa-solid fa-list-ol text-amber-600/70" /> {q.questions} questions</span>
                                            )}
                                            {q.timeLimit ? (
                                              <span className="inline-flex items-center gap-1.5"><i className="fa-solid fa-clock text-amber-600/70" /> {q.timeLimit} min limit</span>
                                            ) : null}
                                            {q.dueDate && (
                                              <span className="inline-flex items-center gap-1.5"><i className="fa-solid fa-calendar-xmark text-amber-600/70" /> Due {new Date(q.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="shrink-0">
                                          <div className="flex flex-col items-center justify-center w-24 h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-500/20 gap-1">
                                            <i className="fa-solid fa-lock text-amber-500 text-xl" />
                                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Locked</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                  /* ── OPEN: Show full quiz details ── */
                                    <div className="p-6">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-primary">{q.course}</span>
                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                              q.tier === 'Mastery'      ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20' :
                                              q.tier === 'Intermediate' ? 'bg-amber-500/10  text-amber-600  border border-amber-500/20'  :
                                              'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                            }`}>
                                              {q.tier === 'Mastery'      ? <><i className="fa-solid fa-fire" /> Mastery Tier</>      :
                                               q.tier === 'Intermediate' ? <><i className="fa-solid fa-bolt" /> Intermediate Tier</> :
                                               <><i className="fa-solid fa-seedling" /> Foundational Tier</>}
                                            </span>
                                            {q.isClosed ? (
                                              <span className="text-xs font-bold text-danger bg-danger/10 border border-danger/20 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                                                <i className="fa-solid fa-ban" />
                                                <span>Closed</span>
                                              </span>
                                            ) : (
                                              <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                                                <i className="fa-solid fa-lock-open" />
                                                <span>Open &amp; Ready</span>
                                              </span>
                                            )}
                                          </div>
                                          <h4 className="font-display font-bold text-foreground text-lg">{q.title}</h4>
                                          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                                            {q.questions > 0  && <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-file-lines text-primary" /> {q.questions} Questions</span>}
                                            {q.timeLimit      && <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-clock text-amber-500" /> {q.timeLimit} Mins</span>}
                                            {q.passingScore !== undefined && <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-trophy text-emerald-500" /> Pass: {q.passingScore}%</span>}
                                            {q.attempts     !== undefined && <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-user-check text-blue-500" /> {q.attempts} Attempt</span>}
                                            {q.closeDate && <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-calendar-xmark text-danger" /> Closes: {new Date(q.closeDate).toLocaleString()}</span>}
                                          </div>
                                        </div>
                                        <div className="shrink-0">
                                          {q.isClosed ? (
                                            <button disabled className="w-full sm:w-auto font-bold px-6 py-3.5 rounded-xl text-xs bg-danger/10 text-danger border-2 border-danger/30 cursor-not-allowed flex items-center justify-center gap-2 opacity-90">
                                              <i className="fa-solid fa-ban text-danger text-sm" />
                                              <span>Quiz Closed</span>
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => { setActiveQuiz(q.id); setCurrentQ(0); setQuizAnswers({}) }}
                                              className="w-full sm:w-auto font-bold px-6 py-3 rounded-xl text-xs bg-primary hover:bg-blue-950 text-white transition-all flex items-center justify-center gap-2 shadow-md"
                                            >
                                              <span>Start Assessment</span>
                                              <i className="fa-solid fa-arrow-right" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                )
                              })

                            )}
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-4">Completed Quizzes</h3>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Quiz', 'Course', 'Score', 'Grade', 'Date'].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleCompletedQuizzes.map((q, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3.5 text-foreground font-medium text-sm">{q.title}</td>
                          <td className="px-5 py-3.5"><span className="font-mono text-xs font-bold text-primary">{q.course}</span></td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono font-bold text-foreground">{q.score}%</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${q.grade.startsWith('A') ? 'bg-green-100 text-green-700' : q.grade.startsWith('B') ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                              {q.grade}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground text-xs">{q.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── GRADES ── */}
          {tab === 'grades' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'GPA Equivalent', val: `${gpaEquivalent}`, sub: 'Approx. 4.0 scale', color: 'text-blue-600' },
                  { label: 'Highest Score', val: `${highestScore}%`, sub: visibleCompletedQuizzes.length ? `${visibleCompletedQuizzes[0]?.course ?? 'Course'} top result` : 'No quizzes yet', color: 'text-success' },
                  { label: 'Quizzes Passed', val: `${passedQuizCount}/${visibleCompletedQuizzes.length}`, sub: visibleCompletedQuizzes.length ? `${Math.round((passedQuizCount / visibleCompletedQuizzes.length) * 100) || 0}% pass rate` : 'No completed quizzes', color: 'text-purple-600' },
                  { label: 'Average Score', val: `${avgScore}%`, sub: 'All completed quizzes', color: 'text-accent' },
                ].map((s, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{s.label}</p>
                    <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
                <h3 className="font-semibold text-foreground mb-5">Grade Summary by Course</h3>
                <div className="space-y-4">
                  {visibleCourses.map((c, i) => (
                    <div key={i} className="flex items-center gap-5 p-4 bg-muted/30 rounded-xl">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold text-primary">{c.code}</span>
                          <span className="text-sm text-foreground">{c.title}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full bg-linear-to-r ${c.color}`} style={{ width: `${c.avgScore}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold font-mono text-foreground">{c.avgScore}%</p>
                        <p className="text-xs text-muted-foreground">{c.quizzesDone} quizzes</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PROGRESS ── */}
          {tab === 'progress' && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
                <h3 className="font-semibold text-foreground mb-6 text-center">Overall Learning Progress</h3>
                <div className="flex flex-wrap justify-center gap-8">
                  {visibleCourses.map((c, i) => (
                    <div key={i} className="flex flex-col items-center gap-3">
                      <ProgressRing value={c.progress} size={80} />
                      <div className="text-center">
                        <p className="font-mono text-xs font-bold text-primary">{c.code}</p>
                        <p className="text-xs text-muted-foreground max-w-20 text-center leading-tight">{c.title.split(' ').slice(0, 3).join(' ')}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-3">
                    <ProgressRing value={overallProgress} size={80} />
                    <div className="text-center">
                      <p className="font-mono text-xs font-bold text-foreground">Overall</p>
                      <p className="text-xs text-muted-foreground">All courses</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
                  <h3 className="font-semibold text-foreground mb-5">Material Completion</h3>
                  <div className="space-y-4">
                    {visibleCourses.filter(c => c.materials > 0).map((c, i) => {
                      // Real reading counts: prefer the live in-memory count if the reader
                      // is currently open for this course, otherwise the server-recorded
                      // per-course count from material_reads (matched tolerantly on course code).
                      const read = materialsReaderCourse?.code === c.code && materials.length > 0
                        ? materials.filter(m => readMaterials[String(m.id)]).length
                        : Math.min(
                            Object.entries(courseReadProgress).find(
                              ([k]) => k.replace(/\s+/g, '').toLowerCase() === c.code.replace(/\s+/g, '').toLowerCase()
                            )?.[1] ?? 0,
                            c.materials,
                          )
                      const pct = c.materials > 0 ? Math.round((read / c.materials) * 100) : 0
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-foreground">{c.code}</span>
                            <span className="text-xs text-muted-foreground">{read}/{c.materials} materials read</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    {visibleCourses.every(c => c.materials === 0) && (
                      <p className="text-xs text-muted-foreground italic">No materials uploaded yet for your enrolled courses.</p>
                    )}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
                  <h3 className="font-semibold text-foreground mb-5">Recent Achievements</h3>
                  <div className="space-y-3">
                    {recentAchievements.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                        <span className="text-2xl"><Icon name={a.icon} size={28} /></span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{a.detail}</p>
                        </div>
                        {a.date && (
                          <span className="text-xs text-muted-foreground font-mono">{new Date(a.date).toLocaleDateString()}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {materialsReaderOpen && materialsReaderCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-0 md:px-4 md:py-6 backdrop-blur-sm">
          <div className="flex h-full md:h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-none md:rounded-[28px] border-0 md:border md:border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between border-b border-border bg-card/70 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Course material reader</p>
                <h3 className="mt-1 text-xl font-semibold text-foreground">{materialsReaderCourse.code} <i className="fa-solid fa-circle-dot text-[10px] mx-1 opacity-40" /> {materialsReaderCourse.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">Read uploaded lecturer notes, slides, and reference files in one place.</p>
              </div>
              <button
                onClick={() => {
                  setMaterialsReaderOpen(false)
                  setMaterialsReaderCourse(null)
                  setMaterials([])
                  setActiveMaterialId(null)
                  setMaterialsError('')
                }}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Close
              </button>
            </div>

            <div className="grid flex-1 min-h-0 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="border-b border-border bg-muted/40 p-3 sm:p-4 lg:border-b-0 lg:border-r overflow-y-auto max-h-[250px] lg:max-h-none">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Materials</h4>
                  <span className="text-xs text-muted-foreground">{materials.length} file{materials.length === 1 ? '' : 's'}</span>
                </div>

                <div className="space-y-2">
                  {materials.length === 0 && !materialsError && materialsListLoading && (
                    <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                      Loading materials...
                    </div>
                  )}

                  {materials.length === 0 && !materialsError && !materialsListLoading && (
                    <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                      No materials have been uploaded for this course yet.
                    </div>
                  )}

                  {materialsError && (
                    <div className="rounded-2xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
                      {materialsError}
                    </div>
                  )}

                  {materials.map(material => {
                    const isActive = activeMaterialId === material.id
                    const extension = (material.name.split('.').pop() || '').toLowerCase()
                    const iconName = extension === 'pdf' ? 'document' : ['doc', 'docx'].includes(extension) ? 'document' : ['ppt', 'pptx'].includes(extension) ? 'analytics' : 'document'
                    const isRead = !!readMaterials[String(material.id)]
                    return (
                      <button
                        key={material.id}
                        onClick={() => {
                          setActiveMaterialId(material.id)
                          setMaterialsError('')
                        }}
                        className={`w-full rounded-2xl border p-3 text-left transition-all ${isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/40 hover:bg-muted/50'}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-lg"><Icon name={iconName} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-foreground">{material.name}</p>
                              {isRead && <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Read</span>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{material.size} • {material.uploaded}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}

                  {/* Reading progress summary */}
                  {materials.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-muted-foreground">Reading Progress</span>
                        <span className="text-xs font-mono font-bold text-foreground">
                          {materials.filter(m => readMaterials[String(m.id)]).length}/{materials.length}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.round((materials.filter(m => readMaterials[String(m.id)]).length / materials.length) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </aside>

              <section className="flex flex-1 min-h-0 flex-col bg-background p-4 overflow-hidden">
                {activeMaterialId === null && !materialsError ? (
                  <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                    Select a material from the list to start reading.
                  </div>
                ) : (
                  <div className="flex flex-1 min-h-0 flex-col rounded-3xl border border-border bg-card/70 overflow-hidden">
                    {(() => {
                      const activeMaterial = materials.find(item => item.id === activeMaterialId)
                      if (!activeMaterial) return null
                      const downloadUrl = `${API_BASE}/api/materials/${activeMaterial.id}/download`

                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 shrink-0">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{activeMaterial.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{activeMaterial.size} • Uploaded by {activeMaterial.lecturer}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                              >
                                Download Original
                              </a>
                            </div>
                          </div>

                          <div className="flex-1 min-h-0 flex flex-col">
                            {/* Font size toolbar — applies to text-based renders (docx/txt/md) */}
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
                              <span className="text-xs text-muted-foreground font-medium">Font size:</span>
                              {(['text-sm', 'text-base', 'text-lg', 'text-xl'] as const).map(size => (
                                <button
                                  key={size}
                                  onClick={() => setReaderFontSize(size)}
                                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                    readerFontSize === size ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                  }`}
                                >
                                  {size === 'text-sm' ? 'S' : size === 'text-base' ? 'M' : size === 'text-lg' ? 'L' : 'XL'}
                                </button>
                              ))}
                            </div>
                            <div className="flex-1 min-h-0">
                              <Suspense fallback={
                                <div className="flex items-center justify-center py-24">
                                  <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                </div>
                              }>
                                <MaterialViewer
                                  key={activeMaterial.id}
                                  materialId={activeMaterial.id}
                                  materialName={activeMaterial.name}
                                  downloadUrl={downloadUrl}
                                  studentId={savedUser?.id}
                                  fontSize={readerFontSize}
                                  onCompleted={() => markMaterialCompleted(activeMaterial.id, savedUser?.id)}
                                />
                              </Suspense>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}