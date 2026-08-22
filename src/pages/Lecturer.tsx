import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent } from 'react'
import type { AppView } from '../App'
import { API_BASE } from '../config'
import ProfileModal from '../components/ProfileModal'
import { dismissNotificationIds, getDismissedNotificationIds } from '../utils/notificationDismissal'
import { QUESTION_TYPE_SECONDS } from '../utils/questionTiming'
import { extractErrorMessage } from '../utils/apiError'

type Tab = 'overview' | 'courses' | 'materials' | 'students' | 'quizgen' | 'quizreview' | 'analytics'

const navItems: { key: Tab; label: string; iconClass: string }[] = [
  { key: 'overview',   label: 'Overview',          iconClass: 'fa-house' },
  { key: 'courses',    label: 'My Courses',        iconClass: 'fa-book-open' },
  { key: 'materials',  label: 'Materials',         iconClass: 'fa-cloud-arrow-up' },
  { key: 'students',   label: 'Students',          iconClass: 'fa-users' },
  { key: 'quizgen',    label: '3-Tier Quiz Wizard', iconClass: 'fa-wand-magic-sparkles' },
  { key: 'quizreview', label: 'Question Banks',    iconClass: 'fa-folder-open' },
  { key: 'analytics',  label: 'Analytics',         iconClass: 'fa-chart-column' },
]

const QUESTION_TYPE_OPTIONS = ['MCQ', 'True/False', 'Fill in the Blank', 'Short Answer'] as const
type QuestionType = typeof QUESTION_TYPE_OPTIONS[number]

function computeTimeLimitMinutes(questions: Array<{ type?: string }>): number {
  if (!questions.length) return 5
  const totalSeconds = questions.reduce((sum, q) => sum + (QUESTION_TYPE_SECONDS[q.type || 'MCQ'] ?? 60), 0)
  return Math.max(5, Math.ceil(totalSeconds / 60))
}

function describeTimeBreakdown(questions: Array<{ type?: string }>): string {
  if (!questions.length) return 'No approved questions yet — approve or add at least one to compute a duration.'
  const counts: Record<string, number> = {}
  for (const q of questions) {
    const t = q.type || 'MCQ'
    counts[t] = (counts[t] || 0) + 1
  }
  return Object.entries(counts).map(([type, count]) => `${count} × ${type} (${QUESTION_TYPE_SECONDS[type] ?? 60}s)`).join('  +  ')
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-success' : value >= 60 ? 'bg-warning' : 'bg-primary'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  )
}

// Shared per-student progress table (quiz progress, reading progress, avg score) — used
// by both the Courses tab's drill-down and the Students tab, so the numbers a lecturer
// sees for a given student are always computed and rendered identically in both places.
function StudentProgressTable({ students }: { students: any[] }) {
  return (
    <div className="divide-y divide-border">
      {/* Table Header */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 bg-muted/40">
        <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student</span>
        <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quiz Progress</span>
        <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reading Progress</span>
        <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Score</span>
        <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Passed</span>
        <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
      </div>

      {students.map(stu => {
        const qDone  = stu.quizzes_done  ?? 0
        const qTotal = stu.quizzes_total ?? 0
        const qPct   = qTotal > 0 ? Math.round((qDone / qTotal) * 100) : 0
        const matTotal = stu.total_materials ?? 0
        const matRead  = stu.materials_read ?? 0
        const rPct     = stu.reading_progress ?? (matTotal > 0 ? Math.round((matRead / matTotal) * 100) : 0)
        const scoreColor = (stu.avg_score ?? 0) >= 70 ? 'text-success' : (stu.avg_score ?? 0) >= 50 ? 'text-warning' : 'text-danger'

        return (
          <div key={stu.id} className="px-5 py-4 hover:bg-muted/30 transition-colors">
            {/* Mobile layout */}
            <div className="sm:hidden space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground text-sm">{stu.name}</p>
                  <p className="text-xs text-muted-foreground">{stu.email}</p>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                  stu.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                }`}>{stu.status || 'active'}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-card rounded-lg p-2.5 border border-border">
                  <p className="text-muted-foreground mb-1">Quiz Progress</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${qPct}%` }} />
                    </div>
                    <span className="font-mono font-bold text-foreground">{qDone}/{qTotal}</span>
                  </div>
                </div>
                <div className="bg-card rounded-lg p-2.5 border border-border">
                  <p className="text-muted-foreground mb-1">Reading</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${rPct}%` }} />
                    </div>
                    <span className="font-mono font-bold text-foreground">{matRead}/{matTotal}</span>
                  </div>
                </div>
                <div className="bg-card rounded-lg p-2.5 border border-border">
                  <p className="text-muted-foreground mb-1">Avg Score</p>
                  <p className={`font-mono font-bold text-lg ${scoreColor}`}>{stu.avg_score > 0 ? `${stu.avg_score}%` : '—'}</p>
                </div>
              </div>
              {/* Individual quiz attempts */}
              {(stu.attempts || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quiz Attempts</p>
                  {(stu.attempts || []).map((att: any, ai: number) => (
                    <div key={ai} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2 text-xs">
                      <div>
                        <span className={`font-bold mr-1.5 ${
                          att.quiz_tier === 'Mastery' ? 'text-purple-600' :
                          att.quiz_tier === 'Intermediate' ? 'text-amber-600' : 'text-emerald-600'
                        }`}>[{att.quiz_tier}]</span>
                        <span className="text-muted-foreground">{att.quiz_title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{att.score}/{att.out_of}</span>
                        <span className={`font-bold ${att.passed ? 'text-success' : 'text-danger'}`}>{att.grade}</span>
                        {att.passed
                          ? <i className="fa-solid fa-circle-check text-success" />
                          : <i className="fa-solid fa-circle-xmark text-danger" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop layout */}
            <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
              <div className="col-span-3">
                <p className="font-semibold text-foreground text-sm">{stu.name}</p>
                <p className="text-xs text-muted-foreground">{stu.email}</p>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      qPct >= 80 ? 'bg-success' : qPct >= 50 ? 'bg-warning' : 'bg-primary'
                    }`} style={{ width: `${qPct}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-foreground shrink-0">{qDone}/{qTotal}</span>
                </div>
                {(stu.attempts || []).length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {(stu.attempts || []).map((att: any, ai: number) => (
                      <div key={ai} className="flex items-center gap-1.5 text-[10px]">
                        <span className={`font-bold ${
                          att.quiz_tier === 'Mastery' ? 'text-purple-600' :
                          att.quiz_tier === 'Intermediate' ? 'text-amber-600' : 'text-emerald-600'
                        }`}>{att.quiz_tier?.slice(0,1) ?? '?'}</span>
                        <span className="text-muted-foreground truncate max-w-[80px]">{att.quiz_title}</span>
                        <span className="font-mono font-bold text-foreground ml-auto">{att.score}/{att.out_of}</span>
                        {att.passed
                          ? <i className="fa-solid fa-circle-check text-success shrink-0" />
                          : <i className="fa-solid fa-circle-xmark text-danger shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      rPct >= 80 ? 'bg-success' : rPct >= 50 ? 'bg-warning' : 'bg-emerald-500'
                    }`} style={{ width: `${rPct}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-foreground shrink-0">{matRead}/{matTotal}</span>
                </div>
              </div>
              <div className="col-span-2">
                <p className={`text-base font-mono font-bold ${scoreColor}`}>{stu.avg_score > 0 ? `${stu.avg_score}%` : '—'}</p>
              </div>
              <div className="col-span-1">
                <span className="text-sm font-semibold text-foreground">{stu.quizzes_passed ?? 0}</span>
                <span className="text-xs text-muted-foreground"> /{qTotal}</span>
              </div>
              <div className="col-span-2">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                  stu.status === 'active' ? 'bg-success/10 text-success' :
                  stu.status === 'suspended' ? 'bg-warning/10 text-warning' :
                  'bg-danger/10 text-danger'
                }`}>{stu.status || 'active'}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// `<input type="datetime-local">` always reads/writes the browser's LOCAL wall-clock time
// (no timezone info). `Date.toISOString()` formats in UTC. Using toISOString() to seed a
// datetime-local default silently shifts the displayed time by the lecturer's UTC offset —
// and since publishing re-parses that string as local time again, the error doubles when
// it's converted back to UTC for the backend. This formatter uses local getters so the
// value shown in the picker, and the instant actually sent to the server, both match what
// the lecturer intended (e.g. "10 minutes from now" really means their local now + 10m).
function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function getInitials(name?: string) {
  if (!name) return 'LE'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function normalizeCourseCode(course?: string) {
  return String(course || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// The `/api/courses` API returns snake_case fields (progress, avg_score, student_count),
// but several views in this file read camelCase names (completion, avgScore, students)
// that don't exist on the raw response — which silently rendered as 0/blank everywhere
// those names were used (Overview stats, "My Courses at a Glance", Analytics). This adds
// the expected aliases without touching every call site.
function mapLecturerCourse(course: Record<string, any>) {
  return {
    ...course,
    completion: course.progress ?? course.completion ?? 0,
    avgScore: course.avg_score ?? course.avgScore ?? 0,
    students: course.student_count ?? course.students ?? 0,
  }
}

export default function Lecturer({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      if (typeof window === 'undefined') return 'overview'
      const stored = window.localStorage.getItem('tmas-lecturer-tab') as Tab | null
      return (stored as Tab) || 'overview'
    } catch {
      return 'overview'
    }
  })
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; type?: string; read?: boolean }>>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [activeReviewTier, setActiveReviewTier] = useState<'Foundational' | 'Intermediate' | 'Mastery'>('Foundational')
  const [publishing, setPublishing] = useState(false)

  type QuestionDraft = {
    tier: 'Foundational' | 'Intermediate' | 'Mastery'
    id: number | null // null => authoring a brand-new question rather than editing one
    question: string
    type: QuestionType
    options: string[]
    answer: string
    explanation: string
  }
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft | null>(null)
  const [questionDraftError, setQuestionDraftError] = useState('')

  function openNewQuestionDraft(tier: 'Foundational' | 'Intermediate' | 'Mastery') {
    setQuestionDraft({ tier, id: null, question: '', type: 'MCQ', options: ['', '', '', ''], answer: '', explanation: '' })
    setQuestionDraftError('')
  }

  function openEditQuestionDraft(tier: 'Foundational' | 'Intermediate' | 'Mastery', q: any) {
    const type: QuestionType = QUESTION_TYPE_OPTIONS.includes(q.type) ? q.type : 'MCQ'
    setQuestionDraft({
      tier,
      id: q.id,
      question: q.question || '',
      type,
      options: type === 'True/False' ? ['True', 'False'] : (Array.isArray(q.options) && q.options.length ? q.options : ['', '', '', '']),
      answer: q.answer ?? '',
      explanation: q.explanation || '',
    })
    setQuestionDraftError('')
  }

  function updateQuestionDraftType(newType: QuestionType) {
    setQuestionDraft(prev => prev && {
      ...prev,
      type: newType,
      options: newType === 'MCQ' ? (prev.options.length >= 2 ? prev.options : ['', '', '', '']) : newType === 'True/False' ? ['True', 'False'] : [],
      answer: newType === 'True/False' && (prev.answer === 'True' || prev.answer === 'False') ? prev.answer : '',
    })
  }

  function saveQuestionDraft() {
    const draft = questionDraft
    if (!draft) return
    const text = draft.question.trim()
    if (!text) { setQuestionDraftError('Question text is required.'); return }

    let options: string[] = []
    const answer = draft.answer.trim()
    if (draft.type === 'MCQ') {
      options = draft.options.map(o => o.trim()).filter(Boolean)
      if (options.length < 2) { setQuestionDraftError('Provide at least 2 answer options.'); return }
      if (!answer || !options.includes(answer)) { setQuestionDraftError('Select which option is the correct answer.'); return }
    } else if (draft.type === 'True/False') {
      options = ['True', 'False']
      if (answer !== 'True' && answer !== 'False') { setQuestionDraftError('Select True or False as the correct answer.'); return }
    } else {
      options = []
      if (!answer) { setQuestionDraftError('Provide the correct answer.'); return }
    }

    const finalQuestion = {
      id: draft.id ?? Date.now() + Math.floor(Math.random() * 1000),
      question: text,
      type: draft.type,
      options,
      answer,
      explanation: draft.explanation.trim(),
      marks: 2,
    }

    setGeneratedQuestionsByTier(prev => {
      const list = prev[draft.tier] || []
      const exists = draft.id != null && list.some(q => q.id === draft.id)
      return { ...prev, [draft.tier]: exists ? list.map(q => (q.id === draft.id ? { ...q, ...finalQuestion } : q)) : [...list, finalQuestion] }
    })

    if (draft.id == null) {
      // A lecturer hand-writing a question clearly means to include it, so auto-approve it
      // the same way freshly AI-generated questions are auto-approved.
      setApprovedByTier(prev => ({ ...prev, [draft.tier]: [...(prev[draft.tier] || []), finalQuestion.id] }))
    }

    setQuestionDraft(null)
    setQuestionDraftError('')
  }

  const [tierScheduleConfigs, setTierScheduleConfigs] = useState<Record<'Foundational' | 'Intermediate' | 'Mastery', {
    questionCount: number
    timeLimit: number
    openDate: string
    closeDate: string
    passingScore: number
    attempts: number
  }>>({
    Foundational: {
      questionCount: 10,
      timeLimit: 20,
      openDate: toLocalDatetimeInputValue(new Date(Date.now() + 10 * 60 * 1000)),
      closeDate: toLocalDatetimeInputValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
      passingScore: 60,
      attempts: 1,
    },
    Intermediate: {
      questionCount: 10,
      timeLimit: 30,
      openDate: toLocalDatetimeInputValue(new Date(Date.now() + 3 * 24 * 3600 * 1000)),
      closeDate: toLocalDatetimeInputValue(new Date(Date.now() + 10 * 24 * 3600 * 1000)),
      passingScore: 60,
      attempts: 1,
    },
    Mastery: {
      questionCount: 10,
      timeLimit: 45,
      openDate: toLocalDatetimeInputValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
      closeDate: toLocalDatetimeInputValue(new Date(Date.now() + 14 * 24 * 3600 * 1000)),
      passingScore: 70,
      attempts: 1,
    },
  })

  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [genCourse, setGenCourse] = useState('')
  const [genCount, setGenCount] = useState('10')
  const [genQuestionTypes, setGenQuestionTypes] = useState<string[]>(['MCQ', 'True/False', 'Fill in the Blank', 'Short Answer'])
  const [genError, setGenError] = useState('')
  const [publishError, setPublishError] = useState('')
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({})
  const [generatedQuestionsByTier, setGeneratedQuestionsByTier] = useState<Record<string, any[]>>({
    Foundational: [],
    Intermediate: [],
    Mastery: [],
  })
  const [approvedByTier, setApprovedByTier] = useState<Record<string, number[]>>({
    Foundational: [],
    Intermediate: [],
    Mastery: [],
  })
  // IDs of the draft quiz rows created immediately at generation time (see backend
  // /quizzes/generate), so publishing updates the same rows instead of duplicating them.
  const [draftQuizIds, setDraftQuizIds] = useState<Record<string, number>>({})
  const [savedUser, setSavedUser] = useState<Record<string, any> | null>(() =>
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : null,
  )
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(() => getDismissedNotificationIds(savedUser?.id))
  const visibleNotifications = useMemo(
    () => notifications.filter(n => !dismissedNotifIds.has(n.id)),
    [notifications, dismissedNotifIds],
  )
  function dismissNotification(id: string) {
    setDismissedNotifIds(dismissNotificationIds(savedUser?.id, [id]))
  }
  function clearAllNotifications() {
    setDismissedNotifIds(dismissNotificationIds(savedUser?.id, notifications.map(n => n.id)))
  }
  function handleNotificationClick(n: { id: string; title: string }) {
    const title = n.title.toLowerCase()
    if (title.includes('assignment') || title.includes('course')) setTab('courses')
    else if (title.includes('quiz')) setTab('quizreview')
    else if (title.includes('student') || title.includes('submi')) setTab('students')
    dismissNotification(n.id)
    setNotifOpen(false)
  }

  // Management view for already-published quizzes, so a lecturer can see (and fix) a
  // quiz that got stuck locked/scheduled instead of having to delete and regenerate it.
  const [publishedQuizzes, setPublishedQuizzes] = useState<any[]>([])
  const [loadingPublishedQuizzes, setLoadingPublishedQuizzes] = useState(false)
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, { openDate: string; closeDate: string }>>({})
  const [savingScheduleId, setSavingScheduleId] = useState<number | null>(null)
  const [scheduleSaveError, setScheduleSaveError] = useState<Record<number, string>>({})
  const [scheduleSaveSuccess, setScheduleSaveSuccess] = useState<Record<number, string>>({})
  // Collapsed by default — this is a secondary maintenance tool (fixing a stuck schedule),
  // not the primary action on this page, and was previously always fully expanded with a
  // full date-editor per quiz, crowding out the actual "generate a new bank" form above it.
  const [publishedPanelOpen, setPublishedPanelOpen] = useState(false)

  // Question Banks archive: every quiz ever published for this lecturer's courses,
  // grouped by course, with the ability to preview or download a hardcopy of the
  // questions — independent of the in-wizard review step, which only covers the
  // current generation session.
  const [questionBankQuizzes, setQuestionBankQuizzes] = useState<any[]>([])
  const [loadingQuestionBanks, setLoadingQuestionBanks] = useState(false)
  const [questionBankError, setQuestionBankError] = useState('')
  const [expandedBankQuizId, setExpandedBankQuizId] = useState<number | null>(null)
  const [bankQuestionsById, setBankQuestionsById] = useState<Record<number, any[]>>({})
  const [loadingBankQuestionsId, setLoadingBankQuestionsId] = useState<number | null>(null)
  // Splits "already published" from "still a draft awaiting review" instead of interleaving
  // them in one flat list — the two categories were getting visually indistinguishable as
  // the archive grew. Defaults to Published since that's what a lecturer browses most.
  const [bankViewFilter, setBankViewFilter] = useState<'published' | 'pending'>('published')
  const [downloadingBankId, setDownloadingBankId] = useState<number | null>(null)
  const [reviewQuizId, setReviewQuizId] = useState<number | null>(null)
  const [attemptReviewData, setAttemptReviewData] = useState<{ quiz?: any; attempts: any[] }>({ attempts: [] })
  const [loadingAttemptReviews, setLoadingAttemptReviews] = useState(false)
  const [attemptReviewError, setAttemptReviewError] = useState('')
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null)
  const [reviewNoteDrafts, setReviewNoteDrafts] = useState<Record<number, string>>({})
  const [savingAttemptAction, setSavingAttemptAction] = useState<number | null>(null)

  const getActiveTier = () => activeReviewTier

  const [myCoursesState, setMyCoursesState] = useState<any[]>([])
  const [materialsState, setMaterialsState] = useState<any[]>([])
  const [studentsState, setStudentsState] = useState<any[]>([])
  const [lecturerAnalytics, setLecturerAnalytics] = useState<{
    avg_score: number
    pass_rate: number
    at_risk_students: number
    highest_completion_course: { code: string; title: string; completion: number } | null
    score_distribution: { code: string; title: string; avg_score: number; students: number; completion: number }[]
  } | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  // Course monitoring drill-down state
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)
  const [courseStudentProgress, setCourseStudentProgress] = useState<Record<string, any[]>>({})
  const [loadingProgress, setLoadingProgress] = useState<Record<string, boolean>>({})
  const [progressError, setProgressError] = useState<Record<string, string>>({})
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingMaterialId, setDeletingMaterialId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleDeleteMaterial = async (material: any) => {
    if (!window.confirm(`Delete "${material.name}"? Students will no longer be able to view or download it. This cannot be undone.`)) return
    setDeletingMaterialId(material.id)
    try {
      const res = await fetch(`${API_BASE}/api/materials/${material.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(extractErrorMessage(err, 'Failed to delete material'))
      }
      setMaterialsState(prev => prev.filter(m => m.id !== material.id))
      setUploadMessage({ type: 'success', text: `Deleted "${material.name}".` })
    } catch (err) {
      setUploadMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete material' })
    } finally {
      setDeletingMaterialId(null)
    }
  }

  const loadLecturerData = async () => {
    if (typeof window !== 'undefined') {
      setSavedUser(JSON.parse(localStorage.getItem('tmas-user') || 'null'))
    }

    const storedUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : savedUser
    const lecturerName = String(storedUser?.name || '').trim()
    if (!lecturerName) return
    try {
      const [coursesRes, materialsRes, studentsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE}/api/courses?lecturer=${encodeURIComponent(lecturerName)}`),
        fetch(`${API_BASE}/api/materials?lecturer=${encodeURIComponent(lecturerName)}`),
        fetch(`${API_BASE}/api/dashboard/students?lecturer=${encodeURIComponent(lecturerName)}`),
        fetch(`${API_BASE}/api/dashboard/lecturer-analytics?lecturer=${encodeURIComponent(lecturerName)}`),
      ])

      if (analyticsRes.ok) {
        setLecturerAnalytics(await analyticsRes.json())
      }

      let fetchedCourses: any[] = []
      if (coursesRes.ok) {
        const data = await coursesRes.json()
        fetchedCourses = (data.courses || []).map(mapLecturerCourse)
        setMyCoursesState(fetchedCourses)
      }

      if (materialsRes.ok) {
        const data = await materialsRes.json()
        setMaterialsState(data.materials || [])
      }

      if (studentsRes.ok) {
        const data = await studentsRes.json()
        setStudentsState(data.students || [])
      }

    } catch (err) {
      console.error('Failed to load lecturer data', err)
    }
  }

  const seenNotifIdsRef = useRef<Set<string>>(new Set())
  const isInitialNotifLoadRef = useRef(true)

  useEffect(() => {
    // Initial data load
    loadLecturerData()

    async function pollNotificationsOnly() {
      try {
        const notifRes = await fetch(`${API_BASE}/api/notifications?role=lecturer`)
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
            // Silently refresh lecturer data when a new notification arrives
            loadLecturerData()
          }
        }
      } catch {}
    }

    pollNotificationsOnly()
    const interval = setInterval(pollNotificationsOnly, 12000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('tmas-lecturer-tab', tab)
    } catch {}
  }, [tab])



  useEffect(() => {
    if (!selectedCourse && myCoursesState.length > 0) {
      setSelectedCourse(myCoursesState[0].code)
    }
    if (!genCourse && myCoursesState.length > 0) {
      setGenCourse(myCoursesState[0].code)
    }
  }, [myCoursesState, selectedCourse, genCourse])

  const loadCourseStudentProgress = useCallback(async (courseCode: string, level?: string, program?: string) => {
    setLoadingProgress(p => ({ ...p, [courseCode]: true }))
    setProgressError(p => ({ ...p, [courseCode]: '' }))
    try {
      const params = new URLSearchParams()
      if (level)   params.set('level',   level)
      if (program) params.set('program', program)
      const url = `${API_BASE}/api/courses/${encodeURIComponent(courseCode)}/student-progress${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setCourseStudentProgress(p => ({ ...p, [courseCode]: data.students || [] }))
        if (data.error) setProgressError(p => ({ ...p, [courseCode]: data.error }))
      } else {
        const err = await res.json().catch(() => ({}))
        setProgressError(p => ({ ...p, [courseCode]: extractErrorMessage(err, `Error ${res.status}`) }))
        setCourseStudentProgress(p => ({ ...p, [courseCode]: [] }))
      }
    } catch (e: any) {
      setProgressError(p => ({ ...p, [courseCode]: e?.message || 'Network error' }))
      setCourseStudentProgress(p => ({ ...p, [courseCode]: [] }))
    } finally {
      setLoadingProgress(p => ({ ...p, [courseCode]: false }))
    }
  }, [])

  // The Students tab shows the same real quiz/reading progress as the Courses tab's
  // drill-down, so pre-load it for every assigned course rather than making the lecturer
  // visit Courses first to warm the cache.
  useEffect(() => {
    if (tab !== 'students') return
    for (const course of myCoursesState) {
      if (!course.code) continue
      if (courseStudentProgress[course.code] !== undefined || loadingProgress[course.code]) continue
      loadCourseStudentProgress(course.code, course.level, course.program)
    }
  }, [tab, myCoursesState, courseStudentProgress, loadingProgress, loadCourseStudentProgress])

  const loadPublishedQuizzes = useCallback(async (course: string) => {
    if (!course) {
      setPublishedQuizzes([])
      return
    }
    setLoadingPublishedQuizzes(true)
    try {
      const res = await fetch(`${API_BASE}/api/quizzes?course=${encodeURIComponent(course)}`)
      if (!res.ok) throw new Error('Failed to load published quizzes')
      const data = await res.json()
      // This endpoint is shared with Question Banks, which intentionally needs draft rows
      // (a bank surfaces there the instant it's generated, before scheduling/publishing) —
      // but "Manage Published Quizzes" must not show them. Left unfiltered, an abandoned
      // draft from an earlier generate attempt that was never published (page refresh,
      // navigating away mid-wizard, generating again before finishing) sits here forever
      // with no schedule, right alongside the real published quiz for the same tier —
      // which is exactly what looks like "the dates never saved."
      const list = (data.quizzes || []).filter((q: any) => q.status !== 'draft')
      setPublishedQuizzes(list)
      setScheduleDrafts(prev => {
        const next = { ...prev }
        for (const q of list) {
          next[q.id] = {
            openDate: q.open_date ? toLocalDatetimeInputValue(new Date(q.open_date)) : '',
            closeDate: q.close_date ? toLocalDatetimeInputValue(new Date(q.close_date)) : '',
          }
        }
        return next
      })
    } catch {
      setPublishedQuizzes([])
    } finally {
      setLoadingPublishedQuizzes(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'quizgen' && genCourse) {
      loadPublishedQuizzes(genCourse)
    }
  }, [tab, genCourse, loadPublishedQuizzes])

  const handleSaveQuizSchedule = async (quizId: number) => {
    const draft = scheduleDrafts[quizId]
    if (!draft) return
    setScheduleSaveSuccess(prev => ({ ...prev, [quizId]: '' }))
    setScheduleSaveError(prev => ({ ...prev, [quizId]: '' }))

    if (!draft.openDate && !draft.closeDate) {
      setScheduleSaveError(prev => ({ ...prev, [quizId]: 'Pick an open date and/or close date before saving.' }))
      return
    }
    if (draft.openDate && draft.closeDate && new Date(draft.closeDate) <= new Date(draft.openDate)) {
      setScheduleSaveError(prev => ({ ...prev, [quizId]: 'Close date must be after open date.' }))
      return
    }

    setSavingScheduleId(quizId)
    try {
      const body: Record<string, string> = {}
      if (draft.openDate) body.open_date = new Date(draft.openDate).toISOString()
      if (draft.closeDate) body.close_date = new Date(draft.closeDate).toISOString()
      const res = await fetch(`${API_BASE}/api/quizzes/${quizId}/schedule`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(extractErrorMessage(err, 'Failed to update schedule'))
      }
      await loadPublishedQuizzes(genCourse)
      setScheduleSaveSuccess(prev => ({ ...prev, [quizId]: 'Schedule saved.' }))
    } catch (err: any) {
      setScheduleSaveError(prev => ({ ...prev, [quizId]: err.message || 'Failed to update schedule' }))
    } finally {
      setSavingScheduleId(null)
    }
  }

  const handleOpenQuizNow = async (quizId: number) => {
    const nowStr = toLocalDatetimeInputValue(new Date())
    setScheduleDrafts(prev => ({ ...prev, [quizId]: { ...(prev[quizId] || { closeDate: '' }), openDate: nowStr } }))
    setSavingScheduleId(quizId)
    setScheduleSaveError(prev => ({ ...prev, [quizId]: '' }))
    try {
      const res = await fetch(`${API_BASE}/api/quizzes/${quizId}/schedule`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ open_date: new Date(nowStr).toISOString() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(extractErrorMessage(err, 'Failed to open quiz now'))
      }
      await loadPublishedQuizzes(genCourse)
    } catch (err: any) {
      setScheduleSaveError(prev => ({ ...prev, [quizId]: err.message || 'Failed to open quiz now' }))
    } finally {
      setSavingScheduleId(null)
    }
  }

  const loadQuestionBanks = useCallback(async (lecturerName: string) => {
    if (!lecturerName) {
      setQuestionBankQuizzes([])
      return
    }
    setLoadingQuestionBanks(true)
    setQuestionBankError('')
    try {
      const res = await fetch(`${API_BASE}/api/quizzes?lecturer=${encodeURIComponent(lecturerName)}`)
      if (!res.ok) throw new Error('Failed to load question banks')
      const data = await res.json()
      setQuestionBankQuizzes(data.quizzes || [])
    } catch (err: any) {
      setQuestionBankError(err.message || 'Failed to load question banks')
      setQuestionBankQuizzes([])
    } finally {
      setLoadingQuestionBanks(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'quizreview' && savedUser?.name) {
      loadQuestionBanks(String(savedUser.name))
    }
  }, [tab, savedUser?.name, loadQuestionBanks])

  const fetchBankQuestions = async (quizId: number): Promise<any[]> => {
    if (bankQuestionsById[quizId]) return bankQuestionsById[quizId]
    const res = await fetch(`${API_BASE}/api/quizzes/${quizId}/full`)
    if (!res.ok) throw new Error('Failed to load this question bank')
    const data = await res.json()
    const questions = data.questions || []
    setBankQuestionsById(prev => ({ ...prev, [quizId]: questions }))
    return questions
  }

  const handleTogglePreviewBank = async (quizId: number) => {
    if (expandedBankQuizId === quizId) {
      setExpandedBankQuizId(null)
      return
    }
    setExpandedBankQuizId(quizId)
    if (!bankQuestionsById[quizId]) {
      setLoadingBankQuestionsId(quizId)
      try {
        await fetchBankQuestions(quizId)
      } catch (err: any) {
        setQuestionBankError(err.message || 'Failed to load questions')
      } finally {
        setLoadingBankQuestionsId(null)
      }
    }
  }

  const loadAttemptReviews = useCallback(async (quizId: number) => {
    setLoadingAttemptReviews(true)
    setAttemptReviewError('')
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/${quizId}/attempt-reviews`)
      if (!response.ok) throw new Error(extractErrorMessage(await response.json().catch(() => ({})), 'Failed to load assessment reviews'))
      setAttemptReviewData(await response.json())
    } catch (error) {
      setAttemptReviewError(error instanceof Error ? error.message : 'Failed to load assessment reviews')
      setAttemptReviewData({ attempts: [] })
    } finally {
      setLoadingAttemptReviews(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'quizreview' && reviewQuizId !== null) loadAttemptReviews(reviewQuizId)
  }, [tab, reviewQuizId, loadAttemptReviews])

  const saveAttemptNote = async (attemptId: number) => {
    const note = (reviewNoteDrafts[attemptId] || '').trim()
    if (!note) return
    setSavingAttemptAction(attemptId)
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/attempts/${attemptId}/review-note`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      if (!response.ok) throw new Error(extractErrorMessage(await response.json().catch(() => ({})), 'Failed to save review note'))
      setReviewNoteDrafts(previous => ({ ...previous, [attemptId]: '' }))
      if (reviewQuizId !== null) await loadAttemptReviews(reviewQuizId)
    } catch (error) {
      setAttemptReviewError(error instanceof Error ? error.message : 'Failed to save review note')
    } finally {
      setSavingAttemptAction(null)
    }
  }

  const grantAttemptRetry = async (attempt: any) => {
    const defaultReason = (reviewNoteDrafts[attempt.id] || '').trim()
    const reason = window.prompt(
      `Grant ${attempt.student?.name || 'this student'} another attempt? Enter the technical or administrative reason.`,
      defaultReason,
    )?.trim()
    if (!reason) return
    if (!window.confirm('This action will reopen the quiz for this student and will be permanently recorded. Continue?')) return
    setSavingAttemptAction(attempt.id)
    try {
      const response = await fetch(`${API_BASE}/api/quizzes/attempts/${attempt.id}/grant-retry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: reason }),
      })
      if (!response.ok) throw new Error(extractErrorMessage(await response.json().catch(() => ({})), 'Failed to grant another attempt'))
      if (reviewQuizId !== null) await loadAttemptReviews(reviewQuizId)
    } catch (error) {
      setAttemptReviewError(error instanceof Error ? error.message : 'Failed to grant another attempt')
    } finally {
      setSavingAttemptAction(null)
    }
  }

  const exportAttemptReviewsCsv = () => {
    const attempts = attemptReviewData.attempts || []
    if (!attempts.length) return
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const headers = ['Student', 'Email', 'Score', 'Out Of', 'Grade', 'Status', 'Submission Reason', 'Violation Count', 'Attempted At', 'Review Notes']
    const rows = attempts.map(attempt => [
      escapeCsv(attempt.student?.name),
      escapeCsv(attempt.student?.email),
      attempt.score ?? 0,
      attempt.out_of ?? 0,
      escapeCsv(attempt.grade),
      escapeCsv(attempt.status),
      escapeCsv(attempt.submission_reason),
      (attempt.integrity_events || []).filter((event: any) => Number(event.violation_number) > 0).length,
      escapeCsv(attempt.attempted_at),
      escapeCsv((attempt.review_actions || []).map((action: any) => `${action.action}: ${action.note}`).join(' | ')),
    ])
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${attemptReviewData.quiz?.title || 'Assessment'}_Reviews_${new Date().toISOString().slice(0, 10)}.csv`.replace(/[^a-z0-9_.-]+/gi, '_')
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadQuestionBank = async (quiz: any) => {
    setDownloadingBankId(quiz.id)
    setQuestionBankError('')
    try {
      const questions = await fetchBankQuestions(quiz.id)
      const lines: string[] = []
      lines.push(quiz.title || 'Question Bank')
      lines.push(`Course: ${quiz.course || '-'}   Tier: ${quiz.tier || '-'}   Questions: ${questions.length}`)
      lines.push('='.repeat(70))
      questions.forEach((q: any, i: number) => {
        lines.push('')
        lines.push(`${i + 1}. ${q.question || ''}`)
        const opts = Array.isArray(q.options) ? q.options : []
        opts.forEach((opt: string, oi: number) => {
          lines.push(`   ${String.fromCharCode(65 + oi)}. ${opt}`)
        })
        lines.push(`   Answer: ${q.correct ?? q.answer ?? ''}`)
      })
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${String(quiz.course || 'course').replace(/[^a-zA-Z0-9]/g, '_')}_${quiz.tier || 'Tier'}_QuestionBank.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setQuestionBankError(err.message || 'Failed to download question bank')
    } finally {
      setDownloadingBankId(null)
    }
  }

  const handleSelectedFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    setSelectedFiles(files)
    setUploadMessage(null)
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const filteredMaterialsForCourse = useMemo(() => {
    if (!genCourse) return materialsState
    const cleanGenCourse = normalizeCourseCode(genCourse)
    return materialsState.filter(m => normalizeCourseCode(m.course) === cleanGenCourse)
  }, [materialsState, genCourse])

  // Keeps the "Uploaded Materials" table in sync with whichever course is selected in the
  // upload form above it, instead of always listing every material across every course.
  const uploadedMaterialsForSelectedCourse = useMemo(() => {
    if (!selectedCourse) return materialsState
    const cleanSelected = selectedCourse.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    return materialsState.filter(m => {
      const matCourse = (m.course || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      return !matCourse || matCourse === cleanSelected || matCourse.includes(cleanSelected) || cleanSelected.includes(matCourse)
    })
  }, [materialsState, selectedCourse])

  useEffect(() => {
    if (selectedMaterialId) {
      const exists = filteredMaterialsForCourse.some(m => String(m.id) === selectedMaterialId)
      if (!exists) setSelectedMaterialId('')
    }
  }, [genCourse, filteredMaterialsForCourse, selectedMaterialId])

  const handleUploadMaterials = async () => {
    const lecturerName = String(savedUser?.name || '').trim()
    if (!lecturerName) {
      setUploadMessage({ type: 'error', text: 'Lecturer name is missing. Please log in again.' })
      return
    }
    if (!selectedCourse) {
      setUploadMessage({ type: 'error', text: 'Select a course before uploading materials.' })
      return
    }
    if (!selectedFiles.length) {
      setUploadMessage({ type: 'error', text: 'Choose one or more files to upload.' })
      return
    }

    setUploading(true)
    setUploadMessage(null)
    try {
      const formData = new FormData()
      formData.append('course', selectedCourse)
      formData.append('lecturer', lecturerName)
      selectedFiles.forEach(file => formData.append('files', file))

      const response = await fetch(`${API_BASE}/api/materials`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-cache',
        body: formData,
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        setUploadMessage({ type: 'error', text: extractErrorMessage(errorBody, response.statusText) })
        return
      }

      const data = await response.json()
      setSelectedFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      const successText = `Uploaded ${data.materials.length} material${data.materials.length === 1 ? '' : 's'} successfully.`
      setUploadMessage(
        data.warning
          ? { type: 'error', text: `${successText} ${data.warning}` }
          : { type: 'success', text: successText },
      )

      try {
        const { dispatchPushNotification } = await import('../utils/notifications')
        await dispatchPushNotification({
          title: 'New Course Material Available',
          message: `${lecturerName} uploaded new course materials for ${selectedCourse}.`,
          target_role: 'student',
          type: 'info',
        })
      } catch {}

      await loadLecturerData()
    } catch (err) {
      console.error('Material upload failed', err)
      setUploadMessage({ type: 'error', text: 'Upload failed. Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  // Duration is derived, not chosen: it's the sum of each approved question's dedicated
  // anti-cheating answering window (see QUESTION_TYPE_SECONDS), so it must stay in sync
  // whenever a question is approved/unapproved, added, or edited (e.g. its type changes).
  useEffect(() => {
    setTierScheduleConfigs(prev => {
      let changed = false
      const next = { ...prev }
      for (const tier of ['Foundational', 'Intermediate', 'Mastery'] as const) {
        const approvedIds = new Set(approvedByTier[tier] || [])
        const approvedQuestions = (generatedQuestionsByTier[tier] || []).filter(q => approvedIds.has(q.id))
        const computed = computeTimeLimitMinutes(approvedQuestions)
        if (next[tier].timeLimit !== computed) {
          next[tier] = { ...next[tier], timeLimit: computed }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [approvedByTier, generatedQuestionsByTier])

  const handleGenerate3TierBank = async () => {
    setGenError('')
    // Validate
    const count = Number(genCount)
    if (!genCourse) {
      setGenError('Please select a course before generating quiz questions.')
      return
    }
    if (!genQuestionTypes.length) {
      setGenError('Select at least one question type.')
      return
    }
    if (!filteredMaterialsForCourse.length) {
      setGenError(`No materials are uploaded for ${genCourse}. Upload course material before generating a quiz.`)
      return
    }
    if (isNaN(count) || count < 3 || count > 30) {
      setGenError('Questions per tier must be between 3 and 30.')
      return
    }
    setGenerating(true)
    setGenerated(false)
    try {
      const materialIds = selectedMaterialId
        ? [Number(selectedMaterialId)]
        : filteredMaterialsForCourse.map(material => Number(material.id))
      const payload = {
        course: genCourse,
        question_count: count,
        generate_all_tiers: true,
        question_types: genQuestionTypes,
        material_ids: materialIds,
      }

      const res = await fetch(`${API_BASE}/api/quizzes/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(extractErrorMessage(await res.json(), res.statusText))
      const data = await res.json()

      const stamp = Date.now()
      const processedByTier: Record<string, any[]> = {
        Foundational: [],
        Intermediate: [],
        Mastery: [],
      }
      const autoApproved: Record<string, number[]> = {
        Foundational: [],
        Intermediate: [],
        Mastery: [],
      }

      if (data.questions_by_tier) {
        for (const tierKey of ['Foundational', 'Intermediate', 'Mastery']) {
          const list = data.questions_by_tier[tierKey] || []
          processedByTier[tierKey] = list.map((q: any, i: number) => ({
            ...q,
            id: q.id != null ? Number(q.id) : stamp + (tierKey === 'Foundational' ? 100 : tierKey === 'Intermediate' ? 200 : 300) + i,
          }))
          autoApproved[tierKey] = processedByTier[tierKey].map(q => q.id)
        }
      }

      setGeneratedQuestionsByTier(processedByTier)
      setApprovedByTier(autoApproved)
      setDraftQuizIds(data.draft_quiz_ids || {})
      setGenerated(true)
      setWizardStep(2)
      // Surfaces immediately in Question Banks even before the lecturer publishes/schedules it.
      loadQuestionBanks(String(savedUser?.name || ''))
    } catch (err: any) {
      setGenError(`Quiz generation failed: ${err.message || 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish3TierSequence = async () => {
    if (!genCourse) return
    setPublishError('')
    // Validate each tier's schedule config
    const errs: Record<string, string> = {}
    for (const tier of ['Foundational', 'Intermediate', 'Mastery'] as const) {
      const cfg = tierScheduleConfigs[tier]
      const tl = Number(cfg.timeLimit)
      const ps = Number(cfg.passingScore)
      const qc = (approvedByTier[tier] || []).length
      if (!cfg.openDate) errs[`${tier}_openDate`] = 'Open date is required.'
      if (!cfg.closeDate) errs[`${tier}_closeDate`] = 'Close date is required.'
      if (cfg.openDate && cfg.closeDate && new Date(cfg.closeDate) <= new Date(cfg.openDate))
        errs[`${tier}_closeDate`] = 'Close date must be after open date.'
      if (isNaN(tl) || tl < 5 || tl > 180) errs[`${tier}_timeLimit`] = 'Duration must be 5–180 mins.'
      if (isNaN(ps) || ps < 1 || ps > 100) errs[`${tier}_passingScore`] = 'Pass score must be 1–100%.'
      if (qc === 0) errs[`${tier}_questions`] = 'No approved questions for this tier — approve at least one in Step 2.'
      if (!errs[`${tier}_timeLimit`] && cfg.openDate && cfg.closeDate) {
        const windowMinutes = (new Date(cfg.closeDate).getTime() - new Date(cfg.openDate).getTime()) / 60000
        if (windowMinutes > 0 && windowMinutes < tl) {
          errs[`${tier}_timeLimit`] = `Duration (${tl}m) exceeds the open–close window (${Math.floor(windowMinutes)}m). Shorten the duration or widen the window.`
        }
      }
    }
    if (Object.keys(errs).length) {
      setScheduleErrors(errs)
      setPublishError('Please fix the errors in the schedule configuration above.')
      return
    }
    setScheduleErrors({})
    setPublishing(true)

    try {
      const selectedMaterial = selectedMaterialId
        ? filteredMaterialsForCourse.find(material => String(material.id) === selectedMaterialId)
        : filteredMaterialsForCourse.length === 1 ? filteredMaterialsForCourse[0] : null
      const quizSubject = selectedMaterial?.name?.replace(/\.[^.]+$/, '') || 'Combined Course Materials'
      const quizzesToPublish = (['Foundational', 'Intermediate', 'Mastery'] as const).map(tier => {
        const config = tierScheduleConfigs[tier]
        const approvedIds = new Set(approvedByTier[tier] || [])
        // Only publish what the lecturer actually approved in the review step — previously
        // every generated question was sent regardless of approval state, making the
        // approve/reject step purely cosmetic.
        const questions = (generatedQuestionsByTier[tier] || []).filter((q: any) => approvedIds.has(q.id))

        return {
          id: draftQuizIds[tier],
          title: `${tier === 'Foundational' ? 'Foundation' : tier} Quiz: ${quizSubject}`,
          course: genCourse,
          tier: tier,
          questions: questions.map((q: any) => ({
            question: q.question,
            type: q.type || 'MCQ',
            options: q.options || [],
            answer: q.answer,
            explanation: q.explanation || '',
          })),
          // The server recomputes and overrides this from the actual question-type mix
          // (QUESTION_TYPE_SECONDS) — sent here only so the request payload is self-describing.
          time_limit: Number(config.timeLimit) || 30,
          passing_score: Number(config.passingScore) || 60,
          attempts: Number(config.attempts) || 1,
          open_date: new Date(config.openDate).toISOString(),
          close_date: new Date(config.closeDate).toISOString(),
          due_date: new Date(config.closeDate).toISOString(),
          material_ids: selectedMaterialId
            ? [Number(selectedMaterialId)]
            : filteredMaterialsForCourse.map(material => Number(material.id)),
        }
      })

      const res = await fetch(`${API_BASE}/api/quizzes/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quizzes: quizzesToPublish }),
      })

      if (!res.ok) throw new Error(extractErrorMessage(await res.json(), res.statusText))

      try {
        const { dispatchPushNotification } = await import('../utils/notifications')
        await dispatchPushNotification({
          title: `New 3-Tier Quiz Sequence Published`,
          message: `3 Quiz Tiers (Foundational, Intermediate, Mastery) published for ${genCourse}.`,
          target_role: 'student',
          type: 'info',
        })
      } catch {}

      setPublishError('')
      setWizardStep(1)
      setGenerated(false)
      await loadPublishedQuizzes(genCourse)
      loadQuestionBanks(String(savedUser?.name || ''))
    } catch (err: any) {
      setPublishError(`Publishing failed: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }


  const [clearingQuizzes, setClearingQuizzes] = useState(false)

  async function handleClearAllQuizzes() {
    if (!window.confirm('⚠️ This will permanently delete ALL quizzes, questions, and student attempt records. This cannot be undone. Proceed?')) return
    setClearingQuizzes(true)
    try {
      const res = await fetch(`${API_BASE}/api/quizzes/all`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        alert(`Failed to clear quizzes: ${extractErrorMessage(err, res.statusText)}`)
        return
      }
      alert('✅ All quizzes, questions, and attempts have been cleared successfully.')
      setGenerated(false)
      setWizardStep(1)
      setGeneratedQuestionsByTier({ Foundational: [], Intermediate: [], Mastery: [] })
      setApprovedByTier({ Foundational: [], Intermediate: [], Mastery: [] })
      setPublishedQuizzes([])
      await loadLecturerData()
    } catch (err: any) {
      alert(`Error clearing quizzes: ${err.message}`)
    } finally {
      setClearingQuizzes(false)
    }
  }

  // Per-course hard-copy results export: one row per enrolled student with their quiz
  // attempts, so a lecturer can download/print results for a specific course rather than
  // only the course-wide summary handleExportGradebook produces.
  function handleDownloadCourseResults(course: { code: string; title: string }, students: any[]) {
    const headers = ['Student Name', 'Email', 'Quizzes Completed', 'Quizzes Total', 'Reading Progress (%)', 'Average Score (%)', 'Status', 'Quiz Title', 'Tier', 'Score', 'Out Of', 'Grade', 'Passed']
    const rows: (string | number)[][] = []
    for (const stu of students) {
      const attempts = stu.attempts || []
      const base = [
        `"${(stu.name || '').replace(/"/g, '""')}"`,
        stu.email || '',
        stu.quizzes_done ?? 0,
        stu.quizzes_total ?? 0,
        stu.reading_progress ?? 0,
        stu.avg_score ?? 0,
        stu.status || 'active',
      ]
      if (attempts.length === 0) {
        rows.push([...base, '', '', '', '', '', ''])
      } else {
        for (const att of attempts) {
          rows.push([...base, `"${(att.quiz_title || '').replace(/"/g, '""')}"`, att.quiz_tier || '', att.score ?? '', att.out_of ?? '', att.grade || '', att.passed ? 'Yes' : 'No'])
        }
      }
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `${course.code}_Results_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function handleExportGradebook() {
    const headers = ['Course Code', 'Course Title', 'Enrolled Students', 'Completion Rate (%)', 'Average Score (%)', 'Status']
    const rows = myCoursesState.map(c => [
      c.code,
      `"${c.title}"`,
      c.students,
      c.completion,
      c.avgScore,
      c.status || 'Active'
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Gradebook_Export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }



    // derived metrics for overview and analytics
    const assignedCourses = myCoursesState.length
    const studentsByCourse = myCoursesState.map(course => ({
      course,
      students: studentsState.filter(student => {
        const sLevel = String(student.level || '').trim().toLowerCase()
        const sProgram = String(student.program || '').trim().toLowerCase()
        const cLevel = String(course.level || '').trim().toLowerCase()
        const cProgram = String(course.program || '').trim().toLowerCase()
        return cLevel && cLevel === sLevel && (!cProgram || cProgram === sProgram)
      }),
    }))
    // Use API student_count (enriched by backend) as primary, fall back to filtered list
    const uniqueStudentCount = myCoursesState.reduce((s, c) => s + ((c as any).student_count ?? 0), 0) || new Set(studentsState.map(s => s.id)).size
    const totalStudents = uniqueStudentCount
    const studentHeadcount = studentsByCourse.reduce((s, entry) => s + entry.students.length, 0)
    const avgQuizScore = myCoursesState.length ? Math.round(myCoursesState.reduce((s, c) => s + (c.avgScore || 0), 0) / myCoursesState.length) : null
    const levelsStr = Array.from(new Set(myCoursesState.map(c => c.level).filter(Boolean))).slice(0, 2).join(', ')
    // Real data from the active 3-tier wizard session — questions generated but not yet
    // approved for publish. (There's no persisted "pending review" queue across sessions:
    // once a bank is published, everything in it was, by definition, approved.)
    const allGeneratedQuestions = (['Foundational', 'Intermediate', 'Mastery'] as const).flatMap(t => generatedQuestionsByTier[t] || [])
    const allApprovedIds = new Set((['Foundational', 'Intermediate', 'Mastery'] as const).flatMap(t => approvedByTier[t] || []))
    const pendingReviews = allGeneratedQuestions.filter(q => !allApprovedIds.has(q.id)).length
    const greeting = (() => {
      const hour = new Date().getHours()
      if (hour < 12) return 'Good morning,'
      if (hour < 17) return 'Good afternoon,'
      return 'Good evening,'
    })()

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
              <p className="text-sidebar-muted text-xs">UENR</p>
            </div>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden text-sidebar-muted hover:text-sidebar-foreground p-1">
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <p className="text-sidebar-muted text-xs font-semibold uppercase tracking-widest px-3 mb-3">Lecturer Portal</p>
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
                <i className={`fa-solid ${item.iconClass} w-4 shrink-0`} />
                {item.label}
                {item.key === 'quizgen' && pendingReviews > 0 && (
                  <span className="ml-auto bg-accent text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {pendingReviews}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{getInitials(savedUser?.name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-foreground text-xs font-semibold truncate">{savedUser?.name || 'Lecturer'}</p>
              <p className="text-sidebar-muted text-xs truncate">{savedUser?.role || 'Lecturer'} · CS Dept</p>
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
              {tab === 'overview' ? 'My Dashboard' : tab === 'courses' ? 'My Teaching Assignments' : tab === 'materials' ? 'Learning Materials' : tab === 'quizgen' ? 'AI Quiz Generator' : tab === 'quizreview' ? 'Question Banks' : 'Course Analytics'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-success/10 text-success px-3 py-1 rounded-full font-semibold">Account Active</span>
            <div className="relative">
              <button
                onClick={async () => {
                  setNotifOpen(!notifOpen)
                  const { requestPushPermission } = await import('../utils/notifications')
                  requestPushPermission()
                }}
                className="relative p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                title="Notifications"
              >
                <i className="fa-solid fa-bell text-lg" />
                {visibleNotifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-10 w-80 max-w-[90vw] bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <p className="font-semibold text-foreground text-sm">Notifications</p>
                      {visibleNotifications.length > 0 ? (
                        <button onClick={clearAllNotifications} className="text-xs text-primary font-medium hover:underline">Clear all</button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Up to date</span>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {visibleNotifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">No new notifications</div>
                      ) : (
                        visibleNotifications.map((n, i) => (
                          <div key={n.id || i} className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors group">
                            <button onClick={() => handleNotificationClick(n)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                              <span className="text-xs font-bold rounded-full px-2 py-1 bg-primary/10 text-primary shrink-0">
                                <i className="fa-solid fa-bell" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-foreground text-xs font-semibold leading-snug">{n.title || 'Notification'}</p>
                                {n.message && <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{n.message}</p>}
                              </div>
                            </button>
                            <button
                              onClick={() => dismissNotification(n.id)}
                              className="shrink-0 text-muted-foreground hover:text-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Dismiss"
                            >
                              <i className="fa-solid fa-xmark text-xs" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-transform hover:scale-105 shadow-sm cursor-pointer"
              title="View Lecturer Profile"
            >
              <span className="text-white text-xs font-bold">{getInitials(savedUser?.name)}</span>
            </button>
          </div>
        </header>

        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          user={savedUser || { name: 'Lecturer', email: '', role: 'lecturer' }}
          onLogout={() => {
            localStorage.removeItem('tmas-token')
            localStorage.removeItem('tmas-user')
            onNavigate('login')
          }}
        />

        {questionDraft && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setQuestionDraft(null)}>
            <div
              className="bg-card border border-border rounded-2xl p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-foreground">
                  {questionDraft.id == null ? 'Add Your Own Question' : 'Edit Question'}
                </h3>
                <button onClick={() => setQuestionDraft(null)} className="text-muted-foreground hover:text-foreground">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1.5">Question Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUESTION_TYPE_OPTIONS.map(qt => (
                    <button
                      key={qt}
                      type="button"
                      onClick={() => updateQuestionDraftType(qt)}
                      className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                        questionDraft.type === qt ? 'bg-primary/10 border-primary text-primary' : 'bg-muted border-border text-muted-foreground'
                      }`}
                    >
                      {qt}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Dedicated answering time: {QUESTION_TYPE_SECONDS[questionDraft.type]}s per attempt.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1.5">Question Text</label>
                <textarea
                  value={questionDraft.question}
                  onChange={e => setQuestionDraft(prev => prev && { ...prev, question: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Type the question..."
                />
              </div>

              {questionDraft.type === 'MCQ' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1.5">Options (select the correct one)</label>
                  <div className="space-y-2">
                    {questionDraft.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuestionDraft(prev => prev && { ...prev, answer: opt.trim() })}
                          disabled={!opt.trim()}
                          className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all disabled:opacity-30 ${
                            opt.trim() && questionDraft.answer === opt.trim() ? 'border-emerald-500 bg-emerald-500' : 'border-border'
                          }`}
                          title="Mark as correct answer"
                        >
                          {opt.trim() && questionDraft.answer === opt.trim() && <i className="fa-solid fa-check text-white text-[10px]" />}
                        </button>
                        <input
                          value={opt}
                          onChange={e => setQuestionDraft(prev => {
                            if (!prev) return prev
                            const options = [...prev.options]
                            const wasAnswer = prev.answer === options[oi].trim()
                            options[oi] = e.target.value
                            return { ...prev, options, answer: wasAnswer ? e.target.value.trim() : prev.answer }
                          })}
                          placeholder={`Option ${oi + 1}`}
                          className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        {questionDraft.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setQuestionDraft(prev => prev && { ...prev, options: prev.options.filter((_, i) => i !== oi) })}
                            className="text-danger/70 hover:text-danger px-1.5"
                          >
                            <i className="fa-solid fa-trash-can text-xs" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {questionDraft.options.length < 6 && (
                    <button
                      type="button"
                      onClick={() => setQuestionDraft(prev => prev && { ...prev, options: [...prev.options, ''] })}
                      className="mt-2 text-xs text-primary font-semibold hover:underline"
                    >
                      + Add option
                    </button>
                  )}
                </div>
              )}

              {questionDraft.type === 'True/False' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1.5">Correct Answer</label>
                  <div className="flex gap-2">
                    {['True', 'False'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQuestionDraft(prev => prev && { ...prev, answer: opt })}
                        className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          questionDraft.answer === opt ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted border-border text-muted-foreground'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(questionDraft.type === 'Fill in the Blank' || questionDraft.type === 'Short Answer') && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1.5">Correct Answer</label>
                  <input
                    value={questionDraft.answer}
                    onChange={e => setQuestionDraft(prev => prev && { ...prev, answer: e.target.value })}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Expected answer"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1.5">Explanation (optional)</label>
                <textarea
                  value={questionDraft.explanation}
                  onChange={e => setQuestionDraft(prev => prev && { ...prev, explanation: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Shown to students after they submit, explaining the correct answer."
                />
              </div>

              {questionDraftError && (
                <p className="text-xs text-danger flex items-center gap-1.5"><i className="fa-solid fa-triangle-exclamation" />{questionDraftError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button onClick={() => setQuestionDraft(null)} className="px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button onClick={saveQuestionDraft} className="px-5 py-2.5 bg-primary hover:bg-blue-950 text-white text-sm font-semibold rounded-xl transition-colors">
                  {questionDraft.id == null ? 'Add Question' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
                <div className="relative overflow-hidden bg-linear-to-br from-primary via-primary to-blue-950 rounded-2xl p-6 text-primary-foreground">
                  <i className="fa-solid fa-chalkboard-user absolute -right-4 -bottom-6 text-[9rem] text-white/5 pointer-events-none select-none" />
                  <div className="relative">
                    <p className="text-primary-foreground/70 text-sm mb-1">{greeting}</p>
                    <h2 className="font-display text-3xl text-white mb-2">{savedUser?.name || 'Lecturer'}</h2>
                    <p className="text-primary-foreground/70 text-sm">
                      You're teaching <span className="text-accent font-semibold">{assignedCourses} course{assignedCourses === 1 ? '' : 's'}</span>
                      {pendingReviews > 0 && <> with <span className="text-white font-semibold">{pendingReviews} question{pendingReviews === 1 ? '' : 's'}</span> waiting for review</>}.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Assigned Courses', val: String(assignedCourses), sub: levelsStr || '—', icon: 'book-open', tint: 'bg-blue-500/10 text-blue-600' },
                    { label: 'Assigned Students', val: String(totalStudents), sub: `${studentHeadcount} course seats`, icon: 'users', tint: 'bg-purple-500/10 text-purple-600' },
                    { label: 'Avg Quiz Score', val: avgQuizScore !== null ? `${avgQuizScore}%` : '—', sub: 'This semester', icon: 'chart-line', tint: 'bg-emerald-500/10 text-emerald-600' },
                    { label: 'Pending Reviews', val: String(pendingReviews), sub: 'Questions to approve', icon: 'hourglass-half', tint: 'bg-amber-500/10 text-amber-600' },
                  ].map((s, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className={`inline-flex p-2 rounded-xl mb-3 ${s.tint}`}>
                        <i className={`fa-solid fa-${s.icon}`} />
                      </div>
                      <p className="text-2xl font-bold font-mono text-foreground">{s.val}</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                    </div>
                  ))}
                </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="font-semibold text-foreground">My Courses at a Glance</h3>
                  {myCoursesState.map((c, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-5 transition-all hover:shadow-md">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-bold text-primary">{c.code}</span>
                            <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{c.level}</span>
                          </div>
                          <h4 className="font-semibold text-foreground">{c.title}</h4>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{c.lastUpdated}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        {[
                          { label: 'Students', val: (c as any).student_count ?? 0 },
                          { label: 'Materials', val: c.materials ?? 0 },
                          { label: 'Quizzes', val: (c as any).quizzes_total ?? 0 },
                        ].map((stat, j) => (
                          <div key={j} className="text-center bg-muted/50 rounded-xl py-2">
                            <p className="text-lg font-bold font-mono text-foreground">{stat.val}</p>
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Student Completion</span>
                          <span>Avg Score: <span className="font-mono font-bold text-foreground">{c.avgScore}%</span></span>
                        </div>
                        <ProgressBar value={c.completion} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Quick Actions</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Upload Material', desc: 'Add new learning content', action: () => setTab('materials'), icon: 'upload' },
                      { label: 'Generate Quiz', desc: 'AI quiz from materials', action: () => setTab('quizgen'), icon: 'robot' },
                      { label: 'Review Questions', desc: `${pendingReviews} pending approval`, action: () => setTab('quizgen'), icon: 'clipboard' },
                      { label: 'View Analytics', desc: 'Student performance data', action: () => setTab('analytics'), icon: 'analytics' },
                    ].map((qa, i) => (
                      <button key={i} onClick={qa.action} className="w-full flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all text-left group">
                        <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          {qa.icon === 'upload' && <i className="fa-solid fa-cloud-arrow-up" />}
                          {qa.icon === 'robot' && <i className="fa-solid fa-wand-magic-sparkles" />}
                          {qa.icon === 'clipboard' && <i className="fa-solid fa-clipboard-check" />}
                          {qa.icon === 'analytics' && <i className="fa-solid fa-chart-column" />}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{qa.label}</p>
                          <p className="text-xs text-muted-foreground">{qa.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── COURSES ── */}
          {tab === 'courses' && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground">My Teaching Assignments</h3>
                    <p className="text-sm text-muted-foreground">Courses currently assigned to you.</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{assignedCourses} assigned course{assignedCourses === 1 ? '' : 's'}</span>
                </div>
              </div>

              {myCoursesState.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
                  No courses are assigned to your account yet. Ask an administrator to assign courses to your profile.
                </div>
              ) : (
                <div className="space-y-4">
                  {myCoursesState.map(course => {
                    const sc = (course as any).student_count ?? 0
                    const isExpanded = expandedCourse === course.code
                    const progressStudents = courseStudentProgress[course.code] || []
                    const isLoading = loadingProgress[course.code]
                    const avgScore = course.avg_score ?? course.avgScore ?? 0
                    const tierColor = {
                      border: 'border-border',
                    }

                    return (
                      <div key={course.code} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all">
                        {/* ── Course Header Card ── */}
                        <div className="p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-mono text-xs font-bold text-primary">{course.code}</span>
                                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{course.level || '—'}</span>
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{course.program || '—'}</span>
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  course.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                                }`}>{course.status || 'active'}</span>
                              </div>
                              <h4 className="font-display font-bold text-foreground text-lg leading-tight">{course.title}</h4>
                            </div>
                          </div>

                          {/* 3 Stat Boxes */}
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-primary/5 border border-primary/10 rounded-xl py-3 text-center">
                              <p className="text-xl font-bold font-mono text-primary">{sc}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Students</p>
                            </div>
                            <div className="bg-muted/50 rounded-xl py-3 text-center">
                              <p className="text-xl font-bold font-mono text-foreground">{course.materials ?? 0}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Materials</p>
                            </div>
                            <div className="bg-muted/50 rounded-xl py-3 text-center">
                              <p className="text-xl font-bold font-mono text-foreground">{course.quizzes_total ?? 0}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Quizzes</p>
                            </div>
                          </div>

                          {/* Avg Score + Completion */}
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground font-medium">Student Completion</span>
                              <span className="text-muted-foreground">Avg Score: <span className="font-mono font-bold text-foreground">{avgScore > 0 ? `${avgScore}%` : '—'}</span></span>
                            </div>
                            <ProgressBar value={course.progress ?? 0} />
                          </div>

                          {/* Monitor Students toggle */}
                          <button
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedCourse(null)
                              } else {
                                setExpandedCourse(course.code)
                                loadCourseStudentProgress(course.code, course.level, course.program)
                              }
                            }}
                            className="w-full flex items-center justify-between gap-2 bg-primary/5 hover:bg-primary/10 border border-primary/15 text-primary font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
                          >
                            <span className="flex items-center gap-2">
                              <i className="fa-solid fa-users-viewfinder" />
                              Monitor Enrolled Students
                              {sc > 0 && <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">{sc}</span>}
                            </span>
                            <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-xs`} />
                          </button>
                        </div>

                        {/* ── Student Progress Drill-Down ── */}
                        {isExpanded && (
                          <div className="border-t border-border bg-muted/20">
                            {/* Panel header with refresh */}
                            <div className="flex items-center justify-between px-5 py-2.5 bg-muted/40 border-b border-border">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student Progress — {course.code}</span>
                              <div className="flex items-center gap-3">
                                {progressStudents.length > 0 && (
                                  <button
                                    onClick={() => handleDownloadCourseResults(course, progressStudents)}
                                    className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                                    title="Download student results for this course as CSV"
                                  >
                                    <i className="fa-solid fa-download text-[10px]" />
                                    Download Results
                                  </button>
                                )}
                                <button
                                  onClick={() => loadCourseStudentProgress(course.code, course.level, course.program)}
                                  disabled={isLoading}
                                  className="text-xs text-primary font-medium hover:underline flex items-center gap-1 disabled:opacity-50"
                                >
                                  <i className={`fa-solid fa-rotate-right text-[10px] ${isLoading ? 'animate-spin' : ''}`} />
                                  Refresh
                                </button>
                              </div>
                            </div>

                            {isLoading ? (
                              <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground text-sm">
                                <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                Loading student progress...
                              </div>
                            ) : progressError[course.code] ? (
                              <div className="px-6 py-6 space-y-2">
                                <div className="flex items-start gap-2 text-sm text-danger">
                                  <i className="fa-solid fa-triangle-exclamation mt-0.5" />
                                  <span>{progressError[course.code]}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Course: {course.code} | Level: {course.level || '—'} | Program: {course.program || '—'}</p>
                              </div>
                            ) : progressStudents.length === 0 && courseStudentProgress[course.code] !== undefined ? (
                              <div className="px-6 py-8 text-center">
                                <i className="fa-solid fa-user-slash text-2xl mb-2 opacity-30 block text-muted-foreground" />
                                {sc > 0 ? (
                                  <>
                                    <p className="text-sm font-semibold text-foreground mb-1">{sc} student{sc === 1 ? '' : 's'} enrolled by course level</p>
                                    <p className="text-xs text-muted-foreground">Student records matched level <strong>{course.level}</strong>{course.program ? ` / ${course.program}` : ''} but detailed profiles are not fully linked yet.</p>
                                    <p className="text-xs text-muted-foreground mt-1">Students in the Users table with level <strong>{course.level}</strong> will appear here once they log in.</p>
                                  </>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No students are currently enrolled in this course.</p>
                                )}
                              </div>
                            ) : progressStudents.length === 0 ? (
                              <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground text-sm">
                                <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                Loading...
                              </div>
                            ) : (
                              <StudentProgressTable students={progressStudents} />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── MATERIALS ── */}
          {tab === 'materials' && (
            <div className="space-y-6">
              <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-primary/40 transition-colors group">
                <div className="text-4xl mb-3"><i className="fa-solid fa-cloud-arrow-up text-4xl text-muted-foreground" /></div>
                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">Upload Learning Materials</h3>
                  <p className="text-muted-foreground text-sm mb-4">Select PDF, DOC/DOCX, PPT/PPTX, TXT or Markdown files, then upload them to a course assignment.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
                  onChange={handleSelectedFiles}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                  <select
                    value={selectedCourse}
                    onChange={e => setSelectedCourse(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {myCoursesState.length > 0 ? (
                      myCoursesState.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.title}</option>
                      ))
                    ) : (
                      <option value="">No assigned courses</option>
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-xl hover:bg-blue-950 transition-colors text-sm"
                  >
                    Choose Files
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadMaterials}
                    disabled={uploading || !selectedFiles.length || !selectedCourse}
                    className="bg-accent text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-amber-600 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Uploading…' : 'Upload Materials'}
                  </button>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="text-left text-sm text-foreground mb-4 bg-muted/40 p-3.5 rounded-xl border border-border">
                    <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Selected Files ({selectedFiles.length})</p>
                    <div className="space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-card px-3 py-2 rounded-lg border border-border text-xs">
                          <span className="truncate max-w-[80%] font-medium text-foreground">
                            {file.name} <span className="text-muted-foreground font-mono ml-1">({(file.size / 1024).toFixed(1)} KB)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="text-danger hover:text-danger/80 font-bold px-2 py-0.5 hover:bg-danger/10 rounded transition-colors"
                            title="Remove file"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploadMessage && (
                  <div className={`rounded-2xl px-4 py-3 text-sm ${uploadMessage.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                    {uploadMessage.text}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-3">Max 50MB per file. Files are processed by AI within 2–5 minutes.</p>
              </div>

              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Uploaded Materials</h3>
                    {selectedCourse && <p className="text-xs text-muted-foreground mt-0.5">Showing materials for <span className="font-mono font-semibold text-primary">{selectedCourse}</span></p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{uploadedMaterialsForSelectedCourse.length} file{uploadedMaterialsForSelectedCourse.length === 1 ? '' : 's'}</span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['File Name', 'Course', 'Size', 'Uploaded', 'AI Status', 'Quiz', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {uploadedMaterialsForSelectedCourse.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">No materials uploaded yet for {selectedCourse || 'this course'}.</td>
                      </tr>
                    )}
                    {uploadedMaterialsForSelectedCourse.map(m => (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{m.name.endsWith('.pdf') ? <i className="fa-solid fa-file-pdf text-red-500" /> : m.name.endsWith('.pptx') || m.name.endsWith('.ppt') ? <i className="fa-solid fa-file-powerpoint text-orange-500" /> : m.name.endsWith('.doc') || m.name.endsWith('.docx') ? <i className="fa-solid fa-file-word text-blue-500" /> : <i className="fa-solid fa-file text-muted-foreground" />}</span>
                            <span className="text-foreground font-medium text-sm max-w-56 truncate">{m.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><span className="font-mono text-xs font-bold text-primary">{m.course}</span></td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs font-mono">{m.size}</td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">{m.uploaded}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${m.status === 'Processed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {m.status === 'Processing...' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />}
                            {m.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {m.quizGenerated
                            ? <span className="text-xs text-success font-semibold"><i className="fa-solid fa-check mr-1" />Generated</span>
                            : <button onClick={() => setTab('quizgen')} className="text-xs text-primary hover:underline font-medium">Generate</button>}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => handleDeleteMaterial(m)}
                            disabled={deletingMaterialId === m.id}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:bg-danger/10 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                            title="Delete this material"
                          >
                            <i className="fa-solid fa-trash-can" />
                            {deletingMaterialId === m.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ── AI QUIZ GENERATOR ── */}
          {tab === 'students' && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Assigned Students</h3>
                    <p className="text-xs text-muted-foreground">Showing students grouped by your assigned course level/program.</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">{uniqueStudentCount}</span>
                  <span className="text-xs text-muted-foreground ml-1">unique students enrolled</span>
                </div>
              </div>

              {studentsByCourse.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
                  No student assignments found yet. Once you are assigned to a course, students enrolled in that course will appear here.
                </div>
              ) : (
                <div className="space-y-4">
                  {studentsByCourse.map(({ course, students }) => {
                    const sc = (course as any).student_count ?? students.length
                    const progressStudents = courseStudentProgress[course.code]
                    const isLoading = loadingProgress[course.code]
                    return (
                      <div key={course.code} className="bg-card border border-border rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{course.code} — {course.title}</p>
                            <p className="text-xs text-muted-foreground">{course.level || '-'} <i className="fa-solid fa-circle-dot text-[8px] mx-1 opacity-40" /> {course.program || '-'}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {progressStudents && progressStudents.length > 0 && (
                              <button
                                onClick={() => handleDownloadCourseResults(course, progressStudents)}
                                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                                title="Download student results for this course as CSV"
                              >
                                <i className="fa-solid fa-download text-[10px]" />
                                Download Results
                              </button>
                            )}
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
                              <i className="fa-solid fa-users text-primary text-xs" />
                              {sc}
                              <span className="text-xs font-normal text-muted-foreground">student{sc === 1 ? '' : 's'}</span>
                            </span>
                          </div>
                        </div>
                        {isLoading || progressStudents === undefined ? (
                          <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground text-sm">
                            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            Loading student progress...
                          </div>
                        ) : progressStudents.length === 0 ? (
                          <div className="px-6 py-5 text-sm text-muted-foreground flex items-center gap-2">
                            {sc > 0
                              ? <><i className="fa-solid fa-circle-info text-primary" /> {sc} student{sc === 1 ? '' : 's'} enrolled — detailed records loading or may require a page refresh.</>
                              : <><i className="fa-solid fa-user-slash opacity-40" /> No students currently enrolled in this course assignment.</>}
                          </div>
                        ) : (
                          <StudentProgressTable students={progressStudents} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 3-FOLD AI QUIZ STEPPER WIZARD ── */}
          {tab === 'quizgen' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Stepper Navigation Header */}
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between max-w-3xl mx-auto relative">
                  <div className="absolute top-5 sm:top-1/2 left-0 right-0 h-1 bg-muted -translate-y-1/2 z-0" />
                  <div
                    className={`absolute top-5 sm:top-1/2 left-0 h-1 bg-primary -translate-y-1/2 z-0 transition-all duration-300 ${
                      wizardStep === 1 ? 'w-0' : wizardStep === 2 ? 'w-1/2' : 'w-full'
                    }`}
                  />

                  {/* Step 1 Button */}
                  <button
                    onClick={() => setWizardStep(1)}
                    className="flex flex-col items-center gap-1.5 relative z-10 group"
                  >
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl font-bold flex items-center justify-center text-sm transition-all ${
                        wizardStep === 1
                          ? 'bg-primary text-white ring-4 ring-primary/20 scale-105 shadow-md'
                          : wizardStep > 1
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {wizardStep > 1 ? <i className="fa-solid fa-check text-sm" /> : '1'}
                    </div>
                    <span className={`text-[10px] sm:text-xs font-semibold text-center leading-tight ${wizardStep === 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                      <span className="hidden sm:inline">1. Question Bank</span>
                      <span className="sm:hidden">Bank</span>
                    </span>
                  </button>

                  {/* Step 2 Button */}
                  <button
                    onClick={() => generated && setWizardStep(2)}
                    disabled={!generated}
                    className="flex flex-col items-center gap-1.5 relative z-10 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl font-bold flex items-center justify-center text-sm transition-all ${
                        wizardStep === 2
                          ? 'bg-primary text-white ring-4 ring-primary/20 scale-105 shadow-md'
                          : wizardStep > 2
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {wizardStep > 2 ? <i className="fa-solid fa-check text-sm" /> : '2'}
                    </div>
                    <span className={`text-[10px] sm:text-xs font-semibold text-center leading-tight ${wizardStep === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                      <span className="hidden sm:inline">2. Tier Review</span>
                      <span className="sm:hidden">Review</span>
                    </span>
                  </button>

                  {/* Step 3 Button */}
                  <button
                    onClick={() => generated && setWizardStep(3)}
                    disabled={!generated}
                    className="flex flex-col items-center gap-1.5 relative z-10 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl font-bold flex items-center justify-center text-sm transition-all ${
                        wizardStep === 3
                          ? 'bg-primary text-white ring-4 ring-primary/20 scale-105 shadow-md'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      3
                    </div>
                    <span className={`text-[10px] sm:text-xs font-semibold text-center leading-tight ${wizardStep === 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                      <span className="hidden sm:inline">3. Schedule</span>
                      <span className="sm:hidden">Schedule</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* ── FOLD 1: QUESTION BANK GENERATION ── */}
              {wizardStep === 1 && (
                <div className="bg-card border border-border rounded-2xl p-5 sm:p-8 max-w-3xl mx-auto space-y-5 sm:space-y-6 shadow-sm">
                  <div className="flex items-start sm:items-center gap-3 pb-4 border-b border-border">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center text-xl sm:text-2xl">
                      <i className="fa-solid fa-wand-magic-sparkles" />
                    </div>
                    <div>
                      <h3 className="font-display text-base sm:text-xl font-bold text-foreground">AI Question Bank Generator</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Select a course and materials. AI generates a full 3-tier bank (Foundational, Intermediate, Mastery).
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Target Course</label>
                      <select
                        value={genCourse}
                        onChange={e => setGenCourse(e.target.value)}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {myCoursesState.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Source Learning Material</label>
                      <select
                        value={selectedMaterialId}
                        onChange={e => setSelectedMaterialId(e.target.value)}
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">All Materials for This Course ({filteredMaterialsForCourse.length} indexed)</option>
                        {filteredMaterialsForCourse.map(m => (
                          <option key={m.id} value={String(m.id)}>
                            📄 {m.name} ({m.course || 'General'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Question Types to Include</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {['MCQ', 'True/False', 'Fill in the Blank', 'Short Answer'].map(qt => {
                        const isChecked = genQuestionTypes.includes(qt)
                        return (
                          <button
                            key={qt}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                if (genQuestionTypes.length > 1) {
                                  setGenQuestionTypes(genQuestionTypes.filter(t => t !== qt))
                                }
                              } else {
                                setGenQuestionTypes([...genQuestionTypes, qt])
                              }
                            }}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              isChecked ? 'bg-primary/10 border-primary text-primary' : 'bg-muted border-border text-muted-foreground'
                            }`}
                          >
                            <i className={`fa-solid ${isChecked ? 'fa-square-check text-primary' : 'fa-square text-muted-foreground'}`} />
                            <span>{qt}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Questions Per Tier</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        value={genCount}
                        onChange={e => setGenCount(e.target.value)}
                        min={3}
                        max={30}
                      className={`w-32 px-4 py-3 bg-muted border rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 transition-colors ${
                          (Number(genCount) < 3 || Number(genCount) > 30) && genCount !== ''
                            ? 'border-danger focus:ring-danger/30 focus:border-danger'
                            : 'border-border focus:ring-primary/30'
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        Generates <strong className="text-foreground">{Number(genCount) * 3 || 30} total questions</strong> across 3 tiers (Foundational, Intermediate, Mastery).
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerate3TierBank}
                    disabled={generating}
                    className="w-full bg-accent hover:bg-amber-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3 text-base disabled:opacity-60"
                  >
                    {generating ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Extracting Objectives & Generating Question Bank...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-wand-magic-sparkles text-amber-300" />
                        <span>Generate 3-Tier Question Bank with AI</span>
                      </>
                    )}
                  </button>

                  {/* Validation error for generate step */}
                  {genError && (
                    <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm font-medium">
                      <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
                      <span>{genError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleClearAllQuizzes}
                    disabled={clearingQuizzes}
                    className="w-full bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-600 font-semibold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                  >
                    {clearingQuizzes ? (
                      <>
                        <span className="w-4 h-4 border-2 border-red-400/40 border-t-red-500 rounded-full animate-spin" />
                        <span>Clearing All Quizzes...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-trash-can" />
                        <span>Clear All Quizzes & Attempts</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ── PUBLISHED QUIZZES MANAGEMENT — fix a stuck/locked schedule without regenerating ── */}
              {genCourse && (() => {
                const lockedCount = publishedQuizzes.filter(q => (q.live_status || (q.is_locked ? 'scheduled' : q.is_closed ? 'closed' : 'available')) === 'scheduled').length
                return (
                <div className="bg-card border border-border rounded-2xl max-w-3xl mx-auto shadow-sm overflow-hidden">
                  <button
                    onClick={() => setPublishedPanelOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-3 p-5 sm:p-6 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <i className={`fa-solid fa-chevron-right text-xs text-muted-foreground transition-transform ${publishedPanelOpen ? 'rotate-90' : ''}`} />
                      <div>
                        <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
                          Published Quizzes — {genCourse}
                          <span className="text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded-full">{publishedQuizzes.length}</span>
                          {lockedCount > 0 && (
                            <span className="text-xs font-bold bg-amber-500/15 text-amber-700 px-2 py-0.5 rounded-full">{lockedCount} locked</span>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Still locked past its opening time? Fix the open/close date here — no need to regenerate.
                        </p>
                      </div>
                    </div>
                  </button>

                  {publishedPanelOpen && (
                  <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
                  <div className="flex items-center justify-end gap-3 -mt-1">
                    <button
                      onClick={() => loadPublishedQuizzes(genCourse)}
                      disabled={loadingPublishedQuizzes}
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-1 disabled:opacity-50 shrink-0"
                    >
                      <i className={`fa-solid fa-rotate-right text-[10px] ${loadingPublishedQuizzes ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {loadingPublishedQuizzes ? (
                    <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground text-sm">
                      <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading published quizzes...
                    </div>
                  ) : publishedQuizzes.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic px-4 py-3 bg-muted/20 rounded-xl border border-dashed border-border">
                      No quizzes published yet for {genCourse}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {publishedQuizzes.map(q => {
                        const draft = scheduleDrafts[q.id] || { openDate: '', closeDate: '' }
                        const liveStatus = q.live_status || (q.is_locked ? 'scheduled' : q.is_closed ? 'closed' : 'available')
                        const badgeClass =
                          liveStatus === 'available' ? 'bg-success/10 text-success' :
                          liveStatus === 'closed'    ? 'bg-danger/10 text-danger' :
                          'bg-amber-500/10 text-amber-700'
                        return (
                          <div key={q.id} className="border border-border rounded-xl p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-foreground">{q.tier || 'Foundational'}</span>
                                <span className="text-sm font-semibold text-foreground">{q.title}</span>
                              </div>
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${badgeClass}`}>{liveStatus}</span>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Open Date</label>
                                <input
                                  type="datetime-local"
                                  value={draft.openDate}
                                  onChange={e => setScheduleDrafts(prev => ({ ...prev, [q.id]: { ...draft, openDate: e.target.value } }))}
                                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-xs font-medium"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Close Date</label>
                                <input
                                  type="datetime-local"
                                  value={draft.closeDate}
                                  onChange={e => setScheduleDrafts(prev => ({ ...prev, [q.id]: { ...draft, closeDate: e.target.value } }))}
                                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-xs font-medium"
                                />
                              </div>
                            </div>

                            {scheduleSaveError[q.id] && (
                              <p className="text-xs text-danger flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation text-[10px]" />{scheduleSaveError[q.id]}</p>
                            )}
                            {scheduleSaveSuccess[q.id] && (
                              <p className="text-xs text-success flex items-center gap-1"><i className="fa-solid fa-circle-check text-[10px]" />{scheduleSaveSuccess[q.id]}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => handleSaveQuizSchedule(q.id)}
                                disabled={savingScheduleId === q.id}
                                className="bg-primary text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-950 transition-colors disabled:opacity-60"
                              >
                                {savingScheduleId === q.id ? 'Saving...' : 'Save Schedule'}
                              </button>
                              {liveStatus === 'scheduled' && (
                                <button
                                  onClick={() => handleOpenQuizNow(q.id)}
                                  disabled={savingScheduleId === q.id}
                                  className="bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-700 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                                >
                                  <i className="fa-solid fa-lock-open mr-1.5" />
                                  Open Now
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  </div>
                  )}
                </div>
                )
              })()}

              {/* ── FOLD 2: TIER QUESTION REVIEW ── */}
              {wizardStep === 2 && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div>
                      <h3 className="font-display text-lg sm:text-xl font-bold text-foreground">Review & Edit Tier Question Banks</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inspect, edit, and approve questions before publishing.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => openNewQuestionDraft(activeReviewTier)}
                        className="bg-muted hover:bg-emerald-50 border border-border text-foreground hover:text-emerald-700 font-semibold text-sm px-4 py-2.5 sm:py-3 rounded-xl transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none"
                      >
                        <i className="fa-solid fa-plus text-xs" />
                        <span>Add Your Own Question</span>
                      </button>
                      <button
                        onClick={() => setWizardStep(3)}
                        className="bg-primary hover:bg-blue-950 text-white font-semibold text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm flex-1 sm:flex-none"
                      >
                        <span>Proceed to Schedule</span>
                        <i className="fa-solid fa-arrow-right text-xs" />
                      </button>
                    </div>
                  </div>

                  {/* Tier Tabs — scrollable on mobile */}
                  <div className="flex border-b border-border gap-1 overflow-x-auto scrollbar-none -mx-1 px-1">
                    {(['Foundational', 'Intermediate', 'Mastery'] as const).map(t => {
                      const count = (generatedQuestionsByTier[t] || []).length
                      const approvedCount = (approvedByTier[t] || []).length
                      const isActive = activeReviewTier === t
                      const badgeColor = t === 'Foundational' ? 'bg-emerald-500/10 text-emerald-600' : t === 'Intermediate' ? 'bg-amber-500/10 text-amber-600' : 'bg-purple-500/10 text-purple-600'

                      return (
                        <button
                          key={t}
                          onClick={() => setActiveReviewTier(t)}
                          className={`shrink-0 px-3 sm:px-6 py-3 sm:py-3.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                            isActive ? 'border-primary text-primary bg-primary/5 rounded-t-xl' : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${badgeColor}`}>{t}</span>
                          <span className="hidden xs:inline">({approvedCount}/{count})</span>
                          <span className="xs:hidden">{approvedCount}/{count}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Question list for active tier */}
                  <div className="space-y-4">
                    {(generatedQuestionsByTier[activeReviewTier] || []).map((q, idx) => {
                      const approvedList = approvedByTier[activeReviewTier] || []
                      const isApproved = approvedList.includes(q.id)

                      return (
                        <div key={q.id || idx} className={`bg-card border rounded-2xl p-4 sm:p-6 transition-all shadow-xs ${isApproved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'}`}>
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-7 h-7 rounded-lg bg-muted text-foreground font-mono font-bold text-xs flex items-center justify-center shrink-0">
                                Q{idx + 1}
                              </span>
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{q.type || 'MCQ'}</span>
                              <span className="text-xs font-semibold text-muted-foreground">{q.marks || 2} marks</span>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              <button
                                onClick={() => openEditQuestionDraft(activeReviewTier, q)}
                                className="px-3 py-1.5 text-xs font-bold rounded-xl border border-border bg-muted hover:bg-blue-50 text-muted-foreground hover:text-primary transition-all flex items-center gap-1.5"
                              >
                                <i className="fa-solid fa-pen" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => {
                                  const currentApproved = approvedByTier[activeReviewTier] || []
                                  const updated = isApproved ? currentApproved.filter(id => id !== q.id) : [...currentApproved, q.id]
                                  setApprovedByTier(prev => ({ ...prev, [activeReviewTier]: updated }))
                                }}
                                className={`px-3 sm:px-4 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 ${
                                  isApproved ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 border-border'
                                }`}
                              >
                                <i className={`fa-solid ${isApproved ? 'fa-check' : 'fa-plus'}`} />
                                <span>{isApproved ? 'Approved' : 'Approve'}</span>
                              </button>
                            </div>
                          </div>

                          <p className="text-sm sm:text-base font-medium text-foreground mb-3 sm:mb-4">{q.question}</p>

                          {q.options && q.options.length > 0 && (
                            <div className="grid sm:grid-cols-2 gap-2 mb-3">
                              {q.options.map((opt: string, oi: number) => (
                                <div
                                  key={oi}
                                  className={`px-4 py-2.5 rounded-xl text-xs font-medium border ${
                                    opt === q.answer ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 font-bold' : 'bg-muted/60 border-border/60 text-muted-foreground'
                                  }`}
                                >
                                  {opt === q.answer && <i className="fa-solid fa-circle-check text-emerald-600 mr-2" />}
                                  {opt}
                                </div>
                              ))}
                            </div>
                          )}

                          {q.explanation && (
                            <div className="bg-muted/40 border border-border/40 rounded-xl p-3 text-xs text-muted-foreground">
                              <strong className="text-foreground">Explanation: </strong>
                              {q.explanation}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── FOLD 3: 3-TIER SCHEDULE CONFIGURATION ── */}
              {wizardStep === 3 && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm">
                    <h3 className="font-display text-lg sm:text-xl font-bold text-foreground">Configure 3-Tier Release Schedule</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set open dates, close dates, duration, pass score, and max attempts for each tier.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {(['Foundational', 'Intermediate', 'Mastery'] as const).map(tier => {
                      const cfg = tierScheduleConfigs[tier]
                      const themeColor = tier === 'Foundational' ? 'border-emerald-500/30' : tier === 'Intermediate' ? 'border-amber-500/30' : 'border-purple-500/30'

                      return (
                        <div key={tier} className={`bg-card border-2 ${themeColor} rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm`}>
                          <div className="flex items-center justify-between pb-3 border-b border-border">
                            <h4 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                              <span>
                                {tier === 'Foundational'
                                  ? <i className="fa-solid fa-circle-dot text-emerald-500" />
                                  : tier === 'Intermediate'
                                  ? <i className="fa-solid fa-circle-dot text-amber-500" />
                                  : <i className="fa-solid fa-circle-dot text-purple-500" />}
                              </span>
                              <span>{tier} Tier</span>
                            </h4>
                            <span className="text-xs font-mono font-bold bg-muted px-2.5 py-1 rounded-lg">
                              {(generatedQuestionsByTier[tier] || []).length} Items Available
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Attempt Duration (Auto-calculated)</label>
                            <div className={`w-full px-3 py-2 bg-muted border rounded-xl text-sm font-bold font-mono flex items-center gap-2 ${scheduleErrors[`${tier}_timeLimit`] ? 'border-danger' : 'border-border'}`}>
                              <i className="fa-solid fa-lock text-[10px] text-muted-foreground" />
                              {cfg.timeLimit} min
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Derived from each approved question's anti-cheating answering window: {describeTimeBreakdown((generatedQuestionsByTier[tier] || []).filter(q => (approvedByTier[tier] || []).includes(q.id)))}
                            </p>
                            {scheduleErrors[`${tier}_timeLimit`] && <p className="text-xs text-danger mt-1 flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation text-[10px]" />{scheduleErrors[`${tier}_timeLimit`]}</p>}
                            {scheduleErrors[`${tier}_questions`] && <p className="text-xs text-danger mt-1 flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation text-[10px]" />{scheduleErrors[`${tier}_questions`]}</p>}
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Availability Open Date</label>
                            <input
                              type="datetime-local"
                              value={cfg.openDate}
                              onChange={e => {
                                const val = e.target.value
                                setTierScheduleConfigs(prev => ({
                                  ...prev,
                                  [tier]: { ...prev[tier], openDate: val },
                                }))
                                if (scheduleErrors[`${tier}_openDate`]) setScheduleErrors(p => ({ ...p, [`${tier}_openDate`]: '' }))
                              }}
                              className={`w-full px-3 py-2 bg-muted border rounded-xl text-xs font-medium ${scheduleErrors[`${tier}_openDate`] ? 'border-danger' : 'border-border'}`}
                            />
                            {scheduleErrors[`${tier}_openDate`] && <p className="text-xs text-danger mt-1 flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation text-[10px]" />{scheduleErrors[`${tier}_openDate`]}</p>}
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Availability Close Date</label>
                            <input
                              type="datetime-local"
                              value={cfg.closeDate}
                              onChange={e => {
                                const val = e.target.value
                                setTierScheduleConfigs(prev => ({
                                  ...prev,
                                  [tier]: { ...prev[tier], closeDate: val },
                                }))
                                if (scheduleErrors[`${tier}_closeDate`]) setScheduleErrors(p => ({ ...p, [`${tier}_closeDate`]: '' }))
                              }}
                              className={`w-full px-3 py-2 bg-muted border rounded-xl text-xs font-medium ${scheduleErrors[`${tier}_closeDate`] ? 'border-danger' : 'border-border'}`}
                            />
                            {scheduleErrors[`${tier}_closeDate`] && <p className="text-xs text-danger mt-1 flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation text-[10px]" />{scheduleErrors[`${tier}_closeDate`]}</p>}
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Pass Score (%)</label>
                              <input
                                type="number"
                                value={cfg.passingScore}
                                onChange={e => {
                                  const val = Number(e.target.value)
                                  setTierScheduleConfigs(prev => ({
                                    ...prev,
                                    [tier]: { ...prev[tier], passingScore: val },
                                  }))
                                }}
                                className="w-full px-2.5 py-1.5 bg-muted border border-border rounded-lg text-xs font-bold"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Max Attempts</label>
                              <input
                                type="number"
                                value={cfg.attempts}
                                onChange={e => {
                                  const val = Number(e.target.value)
                                  setTierScheduleConfigs(prev => ({
                                    ...prev,
                                    [tier]: { ...prev[tier], attempts: val },
                                  }))
                                }}
                                className="w-full px-2.5 py-1.5 bg-muted border border-border rounded-lg text-xs font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={handlePublish3TierSequence}
                    disabled={publishing}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg py-5 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-60"
                  >
                    {publishing ? (
                      <>
                        <span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Publishing All 3 Quiz Tiers to Students...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-paper-plane text-xl" />
                        <span>Publish All 3 Quiz Tiers to Students</span>
                      </>
                    )}
                  </button>

                  {/* Publish validation error */}
                  {publishError && (
                    <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm font-medium">
                      <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
                      <span>{publishError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── QUESTION BANKS ARCHIVE ── */}
          {tab === 'quizreview' && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-foreground">Assessment Attempt Reviews</h3>
                    <p className="text-xs text-muted-foreground mt-1">Review student answers, submission reasons, integrity events, notes, and authorized retries.</p>
                  </div>
                  <button
                    onClick={exportAttemptReviewsCsv}
                    disabled={!attemptReviewData.attempts.length}
                    className="inline-flex items-center gap-2 bg-primary text-white text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-950 disabled:opacity-40"
                  >
                    <i className="fa-solid fa-file-csv" /> Export Reviews
                  </button>
                </div>

                <select
                  value={reviewQuizId ?? ''}
                  onChange={event => setReviewQuizId(event.target.value ? Number(event.target.value) : null)}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select a published quiz to review</option>
                  {questionBankQuizzes.filter(quiz => quiz.status !== 'draft').map(quiz => (
                    <option key={quiz.id} value={quiz.id}>{quiz.course} — {quiz.title}</option>
                  ))}
                </select>

                {attemptReviewError && (
                  <div className="bg-danger/10 border border-danger/25 rounded-xl px-4 py-3 text-sm text-danger">
                    <i className="fa-solid fa-triangle-exclamation mr-2" />{attemptReviewError}
                  </div>
                )}
                {loadingAttemptReviews ? (
                  <div className="py-8 text-center text-sm text-muted-foreground"><i className="fa-solid fa-spinner fa-spin mr-2" />Loading attempts...</div>
                ) : reviewQuizId !== null && !attemptReviewData.attempts.length ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No student attempts have been recorded for this quiz.</div>
                ) : (
                  <div className="space-y-3">
                    {attemptReviewData.attempts.map((attempt: any) => {
                      const isExpanded = expandedAttemptId === attempt.id
                      const violations = (attempt.integrity_events || []).filter((event: any) => Number(event.violation_number) > 0)
                      const reasonLabels: Record<string, string> = {
                        normal: 'Normal submission',
                        timeout: 'Time limit exceeded',
                        left_assessment: 'Assessment exited',
                        integrity_violation: 'Automatic integrity submission',
                        timeout_or_forfeit: 'Timeout or forfeiture (legacy)',
                        in_progress: 'In progress',
                      }
                      return (
                        <div key={attempt.id} className="border border-border rounded-2xl overflow-hidden">
                          <button
                            onClick={() => setExpandedAttemptId(isExpanded ? null : attempt.id)}
                            className="w-full p-4 text-left flex flex-wrap items-center justify-between gap-3 hover:bg-muted/30"
                          >
                            <div>
                              <p className="font-semibold text-sm text-foreground">{attempt.student?.name || 'Unknown student'}</p>
                              <p className="text-xs text-muted-foreground">{attempt.student?.email || attempt.student_id}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`font-bold px-2.5 py-1 rounded-full ${attempt.passed ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{attempt.score ?? 0}% · {attempt.grade || 'F'}</span>
                              <span className="bg-muted px-2.5 py-1 rounded-full text-muted-foreground">{reasonLabels[attempt.submission_reason] || attempt.submission_reason}</span>
                              <span className={`px-2.5 py-1 rounded-full ${violations.length ? 'bg-amber-500/10 text-amber-700' : 'bg-success/10 text-success'}`}>{violations.length} violation{violations.length === 1 ? '' : 's'}</span>
                              <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-muted-foreground`} />
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="border-t border-border bg-muted/15 p-4 sm:p-5 space-y-5">
                              <div className="grid lg:grid-cols-2 gap-5">
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Submitted Answers</h4>
                                  {attempt.answers_available ? attempt.answer_review.map((answer: any, index: number) => (
                                    <div key={index} className="bg-card border border-border rounded-xl p-3 text-xs space-y-1">
                                      <p className="font-semibold text-foreground">{index + 1}. {answer.question}</p>
                                      <p className={answer.unanswered ? 'text-danger' : answer.is_correct ? 'text-success' : 'text-danger'}>
                                        Student: {answer.unanswered ? 'Unanswered' : answer.student_answer}
                                      </p>
                                      <p className="text-success">Correct: {answer.correct_answer}</p>
                                    </div>
                                  )) : <p className="text-xs text-muted-foreground">Answer details are unavailable for this legacy attempt.</p>}
                                </div>

                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Integrity Timeline</h4>
                                  {(attempt.integrity_events || []).length ? attempt.integrity_events.map((event: any) => {
                                    const eventLabels: Record<string, string> = {
                                      assessment_started: 'Assessment started',
                                      tab_hidden: 'Tab switched or window minimized',
                                      fullscreen_exit: 'Fullscreen exited',
                                      assessment_resumed: 'Assessment resumed',
                                      automatic_submission: 'Automatic submission',
                                    }
                                    return (
                                      <div key={event.id} className="flex gap-3 text-xs">
                                        <span className="font-mono text-muted-foreground whitespace-nowrap">{new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                        <span className="text-foreground">{eventLabels[event.event_type] || event.event_type}{event.violation_number ? ` (${event.violation_number}/3)` : ''}</span>
                                      </div>
                                    )
                                  }) : <p className="text-xs text-muted-foreground">No integrity events recorded.</p>}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Review Audit</h4>
                                {(attempt.review_actions || []).map((action: any) => (
                                  <div key={action.id} className="text-xs bg-card border border-border rounded-xl p-3">
                                    <span className="font-semibold">{action.action === 'retry_granted' ? 'Retry granted' : 'Note'}</span>
                                    <span className="text-muted-foreground"> by {action.actor_email || 'lecturer'} on {new Date(action.created_at).toLocaleString()}</span>
                                    <p className="mt-1 text-foreground">{action.note}</p>
                                  </div>
                                ))}
                                <textarea
                                  value={reviewNoteDrafts[attempt.id] || ''}
                                  onChange={event => setReviewNoteDrafts(previous => ({ ...previous, [attempt.id]: event.target.value }))}
                                  rows={3}
                                  placeholder="Add a review note..."
                                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => saveAttemptNote(attempt.id)}
                                    disabled={savingAttemptAction === attempt.id || !(reviewNoteDrafts[attempt.id] || '').trim()}
                                    className="bg-primary text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                                  >Save Note</button>
                                  <button
                                    onClick={() => grantAttemptRetry(attempt)}
                                    disabled={savingAttemptAction === attempt.id || !['completed', 'missed'].includes(attempt.status)}
                                    className="bg-amber-500/15 text-amber-800 border border-amber-500/30 text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                                  ><i className="fa-solid fa-rotate-right mr-1.5" />Grant Another Attempt</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">Question Banks</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Every quiz question bank you've generated, grouped by course. Preview or download a hardcopy at any time.
                  </p>
                </div>

                {(() => {
                  const pendingCount = questionBankQuizzes.filter(q => q.status === 'draft').length
                  const publishedCount = questionBankQuizzes.length - pendingCount
                  return (
                    <div className="inline-flex items-center gap-1 bg-muted rounded-xl p-1 w-full sm:w-auto">
                      <button
                        onClick={() => setBankViewFilter('published')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                          bankViewFilter === 'published' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Published ({publishedCount})
                      </button>
                      <button
                        onClick={() => setBankViewFilter('pending')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          bankViewFilter === 'pending' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Pending Review
                        {pendingCount > 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bankViewFilter === 'pending' ? 'bg-amber-500/15 text-amber-700' : 'bg-amber-500/20 text-amber-700'}`}>
                            {pendingCount}
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })()}
              </div>

              {questionBankError && (
                <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm font-medium">
                  <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
                  <span>{questionBankError}</span>
                </div>
              )}

              {(() => {
                const filteredBankQuizzes = questionBankQuizzes.filter(q => (bankViewFilter === 'pending' ? q.status === 'draft' : q.status !== 'draft'))
                if (loadingQuestionBanks) {
                  return (
                    <div className="flex items-center justify-center gap-3 py-14 text-muted-foreground text-sm">
                      <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading question banks...
                    </div>
                  )
                }
                if (questionBankQuizzes.length === 0) {
                  return (
                    <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
                      No question banks generated yet. Use the 3-Tier Quiz Wizard to generate and publish one.
                    </div>
                  )
                }
                if (filteredBankQuizzes.length === 0) {
                  return (
                    <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
                      {bankViewFilter === 'pending'
                        ? 'Nothing awaiting review right now — every generated question bank has been published.'
                        : "No published question banks yet — check Pending Review, or generate a new one from the 3-Tier Quiz Wizard."}
                    </div>
                  )
                }
                return Object.entries(
                  filteredBankQuizzes.reduce((groups: Record<string, any[]>, q) => {
                    const key = q.course || 'Unassigned'
                    groups[key] = groups[key] || []
                    groups[key].push(q)
                    return groups
                  }, {} as Record<string, any[]>)
                ).map(([courseCode, quizzes]) => (
                  <div key={courseCode} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-border pb-2">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">{courseCode}</span>
                      <span className="text-xs text-muted-foreground">{quizzes.length} question bank{quizzes.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="space-y-3">
                      {quizzes.map((quiz: any) => {
                        const isExpanded = expandedBankQuizId === quiz.id
                        const isLoadingQuestions = loadingBankQuestionsId === quiz.id
                        const questions = bankQuestionsById[quiz.id] || []
                        const displayStatus = quiz.status === 'draft' ? 'draft' : quiz.live_status
                        const statusBadge =
                          displayStatus === 'available' ? 'bg-success/10 text-success' :
                          displayStatus === 'closed' ? 'bg-danger/10 text-danger' :
                          displayStatus === 'draft' ? 'bg-muted text-muted-foreground' :
                          'bg-amber-500/10 text-amber-700'
                        return (
                          <div key={quiz.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                            <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                  quiz.tier === 'Mastery' ? 'bg-purple-500/10 text-purple-600' :
                                  quiz.tier === 'Intermediate' ? 'bg-amber-500/10 text-amber-600' :
                                  'bg-emerald-500/10 text-emerald-600'
                                }`}>{quiz.tier || 'Foundational'}</span>
                                <span className="text-sm font-semibold text-foreground">{quiz.title}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${statusBadge}`}>{displayStatus}</span>
                                <span className="text-xs text-muted-foreground">{quiz.questions ?? 0} questions</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleTogglePreviewBank(quiz.id)}
                                  className="text-xs font-semibold text-primary hover:underline px-2 py-1"
                                >
                                  {isExpanded ? 'Hide' : 'Preview'}
                                </button>
                                <button
                                  onClick={() => handleDownloadQuestionBank(quiz)}
                                  disabled={downloadingBankId === quiz.id}
                                  className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-950 transition-colors disabled:opacity-60"
                                >
                                  <i className="fa-solid fa-download" />
                                  {downloadingBankId === quiz.id ? 'Preparing...' : 'Download'}
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-border bg-muted/20 p-4 sm:p-5 space-y-3 max-h-96 overflow-y-auto">
                                {isLoadingQuestions ? (
                                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                                    <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    Loading questions...
                                  </div>
                                ) : (
                                  questions.map((q: any, i: number) => (
                                    <div key={q.id ?? i} className="bg-card border border-border rounded-xl p-3 text-sm">
                                      <p className="font-medium text-foreground">{i + 1}. {q.question}</p>
                                      {Array.isArray(q.options) && q.options.length > 0 && (
                                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                          {q.options.map((opt: string, oi: number) => (
                                            <li key={oi} className={opt === q.correct ? 'text-success font-semibold' : ''}>
                                              {String.fromCharCode(65 + oi)}. {opt}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      <p className="mt-2 text-xs font-semibold text-foreground">Answer: <span className="text-success">{q.correct}</span></p>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {tab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground text-lg">Class Analytics & Performance</h3>
                  <p className="text-xs text-muted-foreground">Monitor student performance metrics, pass rates, and grade distributions.</p>
                </div>
                <button
                  onClick={handleExportGradebook}
                  className="flex items-center gap-2 bg-primary text-white text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-950 transition-colors shadow-sm"
                >
                  <i className="fa-solid fa-download" />
                  <span>Export Gradebook (CSV)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Avg Quiz Score', val: lecturerAnalytics ? `${lecturerAnalytics.avg_score}%` : '—', trend: 'Across all courses', icon: 'chart-line', tint: 'bg-blue-500/10 text-blue-600' },
                  { label: 'Highest Completion', val: lecturerAnalytics?.highest_completion_course ? lecturerAnalytics.highest_completion_course.code : '—', trend: lecturerAnalytics?.highest_completion_course ? `${lecturerAnalytics.highest_completion_course.completion}% complete` : '—', icon: 'trophy', tint: 'bg-emerald-500/10 text-emerald-600' },
                  { label: 'Pass Rate', val: lecturerAnalytics ? `${lecturerAnalytics.pass_rate}%` : '—', trend: 'Of all quiz attempts', icon: 'circle-check', tint: 'bg-purple-500/10 text-purple-600' },
                  { label: 'At-Risk Students', val: lecturerAnalytics ? String(lecturerAnalytics.at_risk_students) : '—', trend: 'Below 50% completion', icon: 'triangle-exclamation', tint: 'bg-amber-500/10 text-amber-600' },
                ].map((s, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                    <div className={`inline-flex p-2 rounded-xl mb-3 ${s.tint}`}>
                      <i className={`fa-solid fa-${s.icon}`} />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{s.label}</p>
                    <p className="text-2xl font-bold font-mono text-foreground">{s.val}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.trend}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="font-semibold text-foreground mb-5">Score Distribution by Course</h3>
                <div className="space-y-5">
                  {(lecturerAnalytics?.score_distribution || []).map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground font-mono">{c.code}</span>
                        <span className="text-sm font-bold font-mono text-foreground">{c.avg_score}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.avg_score >= 80 ? 'bg-success' : c.avg_score >= 50 ? 'bg-primary' : 'bg-amber-500'}`}
                          style={{ width: `${c.avg_score}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">{c.students} students</span>
                        <span className="text-xs text-muted-foreground">{c.completion}% completion</span>
                      </div>
                    </div>
                  ))}
                  {lecturerAnalytics && lecturerAnalytics.score_distribution.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No quiz activity yet for your courses.</p>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
