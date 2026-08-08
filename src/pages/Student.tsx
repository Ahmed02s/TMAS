import { useEffect, useMemo, useState, useRef } from 'react'
import type { AppView } from '../App'
import { API_BASE } from '../config'
import Icon from '../components/Icon'
import ProfileModal from '../components/ProfileModal'

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
    progress: course.progress,
    materials: course.materials,
    quizzesTotal: course.quizzes_total,
    quizzesDone: course.quizzes_done,
    avgScore: course.avg_score,
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

function mapQuiz(quiz: Record<string, any>): Quiz {
  const now = new Date()
  const openDt  = quiz.open_date  ? new Date(quiz.open_date)  : null
  const closeDt = quiz.close_date ? new Date(quiz.close_date) : null

  // Locked: opening time hasn't arrived yet
  const isLocked = !!(quiz.is_locked || quiz.status === 'scheduled' || (openDt && openDt > now))
  // Closed: availability window has ended (close_date in the past)
  const isClosed = !!(closeDt && closeDt < now)

  let status: string
  if (isLocked)        status = 'locked'
  else if (isClosed)   status = 'closed'
  else                 status = quiz.status || 'available'

  const tier = inferTier(quiz)
  return {
    id: quiz.id,
    title: quiz.title,
    course: quiz.course,
    questions: quiz.questions,
    timeLimit: quiz.time_limit,
    passingScore: quiz.passing_score,
    attempts: quiz.attempts,
    dueDate: quiz.due_date,
    openDate: quiz.open_date,
    closeDate: quiz.close_date,
    status,
    difficulty: quiz.difficulty,
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
  const [activeMaterialId, setActiveMaterialId] = useState<number | null>(null)
  const [materialPreviewText, setMaterialPreviewText] = useState('')
  const [materialPreviewLoading, setMaterialPreviewLoading] = useState(false)
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
  const quizAnswersRef = useRef<Record<number, string>>({})
  const isAutoSubmittingRef = useRef(false)

  useEffect(() => {
    quizAnswersRef.current = quizAnswers
  }, [quizAnswers])

  const [readerSearchQuery, setReaderSearchQuery] = useState('')
  const [readerFontSize, setReaderFontSize] = useState<'text-xs' | 'text-sm' | 'text-base' | 'text-lg'>('text-sm')
  const [readerTheme, setReaderTheme] = useState<'default' | 'sepia' | 'dark'>('default')
  const [flippedFlashcards, setFlippedFlashcards] = useState<Record<number, boolean>>({})
  const [readMaterials, setReadMaterials] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('tmas-read-materials') || '{}')
    } catch {
      return {}
    }
  })

  const markMaterialRead = (materialId: number) => {
    setReadMaterials(prev => {
      const next = { ...prev, [String(materialId)]: true }
      try { localStorage.setItem('tmas-read-materials', JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedUser = JSON.parse(localStorage.getItem('tmas-user') || 'null') as { id?: string; name?: string; level?: string; program?: string } | null
    setSavedUser(storedUser)
    setStudentProfile({
      level: storedUser?.level ?? '',
      program: storedUser?.program ?? '',
    })
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
    const interval = setInterval(pollNotificationsOnly, 12000)
    return () => clearInterval(interval)
  }, [studentProfile.level, studentProfile.program, savedUser])

  useEffect(() => {
    if (!materialsReaderOpen || !activeMaterialId) {
      setMaterialPreviewText('')
      return
    }

    const activeMaterial = materials.find(item => item.id === activeMaterialId)
    if (!activeMaterial) return

    if (activeMaterial) {
      const activeMaterialIdLocal = activeMaterial.id
      const activeMaterialName = activeMaterial.name
      const extension = (activeMaterialName.split('.').pop() || '').toLowerCase()
      if (!['txt', 'md'].includes(extension)) {
        setMaterialPreviewText('')
        return
      }

      let cancelled = false
      async function loadTextPreview() {
        setMaterialPreviewLoading(true)
        setMaterialsError('')
        try {
          const res = await fetch(`${API_BASE}/api/materials/${activeMaterialIdLocal}/download`)
          if (!res.ok) throw new Error('Unable to preview this file')
          const text = await res.text()
          if (!cancelled) setMaterialPreviewText(text)
        } catch (error) {
          if (!cancelled) {
            setMaterialPreviewText('')
            setMaterialsError(error instanceof Error ? error.message : 'Unable to load preview')
          }
        } finally {
          if (!cancelled) setMaterialPreviewLoading(false)
        }
      }

      loadTextPreview()
      return () => {
        cancelled = true
      }
    }
  }, [activeMaterialId, materials, materialsReaderOpen])

  useEffect(() => {
    async function loadQuizQuestions() {
      if (activeQuiz === null) {
        setQuizQuestions([])
        return
      }

      setQuizLoading(true)
      setError('')

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
        setQuizTimeLeft(null)
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

  useEffect(() => {
    if (activeQuiz !== null && selectedQuiz && selectedQuiz.timeLimit > 0 && quizTimeLeft === null) {
      setQuizTimeLeft(selectedQuiz.timeLimit * 60)
    }
  }, [activeQuiz, selectedQuiz, quizTimeLeft])

  useEffect(() => {
    if (activeQuiz !== null && quizTimeLeft !== null && quizTimeLeft > 0 && !quizSubmitted) {
      const timer = setInterval(() => {
        setQuizTimeLeft(prev => {
          if (prev === null) return null
          if (prev <= 1) {
            clearInterval(timer)
            handleSubmitQuiz()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [activeQuiz, quizTimeLeft, quizSubmitted])

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
  const achievementMessages = [
    `Passed ${passedQuizCount} quiz${passedQuizCount === 1 ? '' : 'zes'}`,
    `Completed ${visibleCourses.length} enrolled course${visibleCourses.length === 1 ? '' : 's'}`,
    `${availableQuizzes.filter(q => q.status === 'available').length} quizzes available`,
  ]

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
            <button onClick={() => setActiveQuiz(null)} className="text-primary-foreground/70 hover:text-primary-foreground text-sm">Exit</button>
          </div>
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
            <div className="text-5xl mb-4">{score >= 60 ? <Icon name="celebrate" size={48} /> : <Icon name="book" size={48} />}</div>
            <h2 className="font-display text-2xl sm:text-3xl text-foreground mb-2">{score >= 60 ? 'Quiz Passed!' : 'Keep Studying'}</h2>
            <p className="text-muted-foreground text-sm mb-6">{selectedQuiz?.title ?? 'Quiz Attempt'} <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" /> {selectedQuiz?.course ?? 'Course'}</p>
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

            <button onClick={() => { setActiveQuiz(null); setQuizSubmitted(false); setCurrentQ(0); setQuizAnswers({}); setFlippedFlashcards({}) }} className="w-full mt-6 bg-primary hover:bg-blue-950 text-white font-semibold py-3.5 rounded-xl transition-colors">
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
                {item.key === 'quizzes' && visibleQuizzes.filter(q => q.status === 'available').length > 0 && (
                  <span className="ml-auto bg-accent text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {visibleQuizzes.filter(q => q.status === 'available').length}
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
                  You have <span className="text-accent font-semibold">{visibleQuizzes.filter(q => q.status === 'available').length} quizzes</span> available and your overall progress is <span className="text-white font-semibold">{overallProgress}%</span>.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Enrolled Courses', val: String(visibleCourses.length), sub: studentProfile.level, icon: 'book-open' },
                  { label: 'Quizzes Available', val: String(visibleQuizzes.filter(q => q.status === 'available').length), sub: 'Ready to attempt', icon: 'clipboard-question' },
                  { label: 'Avg Quiz Score', val: `${avgScore}%`, sub: `${visibleCompletedQuizzes.length} completed`, icon: 'chart-line' },
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
                    {visibleQuizzes.map(q => (
                      <div key={q.id} className={`flex items-center gap-4 p-4 rounded-xl border ${q.status === 'overdue' ? 'border-danger/25 bg-danger/5' : 'border-border hover:border-primary/30 hover:bg-muted/30'} transition-colors`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs font-bold text-primary">{q.course}</span>
                          {q.status === 'overdue' && <span className="text-xs text-danger font-semibold">Overdue</span>}
                          {q.tier && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{q.tier}</span>}
                        </div>
                        <p className="text-sm text-foreground font-medium truncate">{q.title}</p>
                        <p className="text-xs text-muted-foreground">{q.questions} questions <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" /> {q.timeLimit} min <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" /> Due {q.dueDate}</p>
                        {q.openDate && (
                          <p className="text-xs text-muted-foreground">Open from {q.openDate}</p>
                        )}
                        {q.closeDate && q.closeDate !== q.dueDate && (
                          <p className="text-xs text-muted-foreground">Closes {q.closeDate}</p>
                        )}
                        </div>
                        <button
                          onClick={() => { setActiveQuiz(q.id); setCurrentQ(0); setQuizAnswers({}) }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${q.status === 'overdue' ? 'bg-danger/10 text-danger hover:bg-danger/20' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                        >
                          {q.status === 'overdue' ? 'Late Submit' : 'Start'}
                          {q.status !== 'overdue' && <i className="fa-solid fa-arrow-right text-xs ml-1" />}
                        </button>
                      </div>
                    ))}
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
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { val: c.materials, label: 'Materials' },
                        { val: `${c.quizzesDone}/${c.quizzesTotal}`, label: 'Quizzes Done' },
                        { val: `${c.avgScore}%`, label: 'Avg Score' },
                      ].map((s, j) => (
                        <div key={j} className="bg-muted/50 rounded-xl py-2.5 text-center">
                          <p className="text-base font-bold font-mono text-foreground">{s.val}</p>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      let computedProgress = c.progress
                      if (c.materials > 0) {
                        const readCount = materials.length > 0 && materialsReaderCourse?.code === c.code
                          ? materials.filter(m => readMaterials[String(m.id)]).length
                          : 0
                        const matProgress = c.materials > 0 ? Math.round((readCount / c.materials) * 50) : 0
                        const quizProgress = c.quizzesTotal > 0 ? Math.round((c.quizzesDone / c.quizzesTotal) * 50) : 0
                        computedProgress = matProgress + quizProgress
                      }
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-muted-foreground font-medium">Completion</span>
                            <span className="text-xs font-mono font-bold text-foreground">{computedProgress}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full bg-linear-to-r ${c.color} transition-all duration-500`} style={{ width: `${computedProgress}%` }} />
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
                        setMaterialPreviewText('')
                        setMaterialsError('')

                        try {
                          const res = await fetch(`${API_BASE}/api/materials?course=${encodeURIComponent(c.code)}`)
                          if (!res.ok) throw new Error('Unable to load course materials')
                          const data = await res.json()
                          const mats = (data.materials || []) as MaterialItem[]
                          setMaterials(mats)
                          if (mats[0]) {
                            setActiveMaterialId(mats[0].id)
                            markMaterialRead(mats[0].id)
                          }
                        } catch (err) {
                          setMaterialsError(err instanceof Error ? err.message : 'Unable to load course materials')
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

                {visibleQuizzes.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-10 text-center">
                    <p className="text-sm font-medium text-foreground">No quizzes found for your current level and program.</p>
                    <p className="text-xs text-muted-foreground mt-2">Ask your lecturer to publish a quiz or check back later.</p>
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
                              tierQuizzes.map(q => (
                                <div key={q.id} className={`bg-card border rounded-2xl p-6 transition-all shadow-xs ${
                                  q.isLocked ? 'border-amber-500/30 bg-amber-500/5' :
                                  q.isClosed ? 'border-danger/30 bg-danger/5' :
                                  'border-border hover:border-primary/30'
                                }`}>
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-primary">{q.course}</span>
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                          q.tier === 'Mastery' ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20' :
                                          q.tier === 'Intermediate' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                          'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                        }`}>
                                          {q.tier === 'Mastery'
                                            ? <><i className="fa-solid fa-fire" /> Mastery Tier</>
                                            : q.tier === 'Intermediate'
                                            ? <><i className="fa-solid fa-bolt" /> Intermediate Tier</>
                                            : <><i className="fa-solid fa-seedling" /> Foundational Tier</>}
                                        </span>

                                        {q.isLocked ? (
                                          <span className="text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                                            <i className="fa-solid fa-lock" />
                                            <span>Opens {q.openDate ? new Date(q.openDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'at scheduled time'}</span>
                                          </span>
                                        ) : q.isClosed ? (
                                          <span className="text-xs font-bold text-danger bg-danger/10 border border-danger/20 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                                            <i className="fa-solid fa-circle-xmark" />
                                            <span>Closed {q.closeDate ? new Date(q.closeDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
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
                                        <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-file-lines text-primary" /> {q.questions} Questions</span>
                                        <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-clock text-amber-500" /> {q.timeLimit || 20} Mins</span>
                                        <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-trophy text-emerald-500" /> Pass: {q.passingScore}%</span>
                                        <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-user-check text-blue-500" /> {q.attempts} Attempt</span>
                                        {q.openDate && (
                                          <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-calendar-check text-muted-foreground" /> Opens: {new Date(q.openDate).toLocaleString()}</span>
                                        )}
                                        {q.closeDate && (
                                          <span className="inline-flex items-center gap-1.5 font-medium"><i className="fa-solid fa-calendar-xmark text-danger" /> Closes: {new Date(q.closeDate).toLocaleString()}</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="shrink-0">
                                      {q.isLocked ? (
                                        <button disabled
                                          className="w-full sm:w-auto font-bold px-6 py-3.5 rounded-xl text-xs bg-amber-500/10 text-amber-700 border-2 border-amber-500/30 cursor-not-allowed flex items-center justify-center gap-2 opacity-90"
                                          title={`Locked until ${q.openDate ? new Date(q.openDate).toLocaleString() : 'scheduled opening time'}`}
                                        >
                                          <i className="fa-solid fa-lock text-amber-600 text-sm" />
                                          <span>Quiz Locked</span>
                                        </button>
                                      ) : q.isClosed ? (
                                        <button disabled
                                          className="w-full sm:w-auto font-bold px-6 py-3.5 rounded-xl text-xs bg-danger/10 text-danger border-2 border-danger/30 cursor-not-allowed flex items-center justify-center gap-2 opacity-90"
                                          title={`Closed since ${q.closeDate ? new Date(q.closeDate).toLocaleString() : 'the availability window'}`}
                                        >
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
                              ))
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
                    {visibleCourses.map((c, i) => {
                      const read = Math.round(c.materials * (c.progress / 100))
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-foreground">{c.code}</span>
                            <span className="text-xs text-muted-foreground">{read}/{c.materials} materials read</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${(read / c.materials) * 100}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
                  <h3 className="font-semibold text-foreground mb-5">Recent Achievements</h3>
                  <div className="space-y-3">
                    {achievementMessages.map((message, i) => {
                      const icons = ['trophy', 'book', 'bolt', 'target']
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                          <span className="text-2xl"><Icon name={icons[i] ?? 'trophy'} size={28} /></span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-foreground">Achievement</p>
                            <p className="text-xs text-muted-foreground">{message}</p>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {completedQuizzes[i]?.date ? new Date(completedQuizzes[i].date).toLocaleDateString() : `${i + 1}d ago`}
                          </span>
                        </div>
                      )
                    })}
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
                  setMaterialPreviewText('')
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
                  {materials.length === 0 && !materialsError && (
                    <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                      Loading materials...
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
                          markMaterialRead(material.id)
                          setMaterialPreviewLoading(true)
                          fetch(`${API_BASE}/api/materials/${material.id}/content`)
                            .then(r => r.json())
                            .then(d => {
                              setMaterialPreviewText(d.content || d.text || '')
                            })
                            .catch(() => setMaterialPreviewText('Unable to extract preview text.'))
                            .finally(() => setMaterialPreviewLoading(false))
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

                          <div className="flex-1 min-h-0 overflow-hidden p-0">
                            {(() => {
                              const ext = (activeMaterial.name.split('.').pop() || '').toLowerCase()
                              const isPdf = ext === 'pdf'
                              const isSlides = ['ppt', 'pptx'].includes(ext)
                              const isDoc = ['doc', 'docx'].includes(ext)

                              // Use Supabase public URL directly — avoids the "not on disk" error
                              const directUrl = activeMaterial.file_url || downloadUrl

                              if (isPdf) {
                                return (
                                  <iframe
                                    key={activeMaterial.id}
                                    src={directUrl}
                                    title={activeMaterial.name}
                                    className="w-full h-full border-0"
                                    style={{ minHeight: '70vh' }}
                                    allowFullScreen
                                  />
                                )
                              }

                              if (isSlides || isDoc) {
                                // Google Docs Viewer renders Office files in any browser
                                const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(directUrl)}&embedded=true`
                                return (
                                  <iframe
                                    key={activeMaterial.id}
                                    src={googleViewerUrl}
                                    title={activeMaterial.name}
                                    className="w-full h-full border-0"
                                    style={{ minHeight: '70vh' }}
                                    allowFullScreen
                                  />
                                )
                              }

                              // Text / fallback content viewer
                              return (
                                <div className="h-full flex flex-col">
                                  {/* Font size toolbar */}
                                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
                                    <span className="text-xs text-muted-foreground font-medium">Font size:</span>
                                    {(['text-sm', 'text-base', 'text-lg', 'text-xl'] as const).map(size => (
                                      <button
                                        key={size}
                                        onClick={() => setReaderFontSize(size as any)}
                                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                          readerFontSize === size ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                        }`}
                                      >
                                        {size === 'text-sm' ? 'S' : size === 'text-base' ? 'M' : size === 'text-lg' ? 'L' : 'XL'}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                                    {materialPreviewLoading ? (
                                      <div className="flex items-center justify-center py-20">
                                        <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                      </div>
                                    ) : (
                                      <div className={`${readerFontSize} leading-relaxed text-foreground whitespace-pre-wrap max-w-none`}>
                                        {materialPreviewText || 'No text content available. Try downloading the original file.'}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })()}
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