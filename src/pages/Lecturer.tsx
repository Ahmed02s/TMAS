import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react'
import Icon from '../components/Icon'
import type { AppView } from '../App'
import { API_BASE } from '../config'
import ProfileModal from '../components/ProfileModal'

type Tab = 'overview' | 'courses' | 'materials' | 'students' | 'quizgen' | 'quizreview' | 'analytics'

const navItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'courses', label: 'My Courses', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { key: 'materials', label: 'Materials', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
  { key: 'students', label: 'Students', icon: 'M12 14l9-5-9-5-9 5 9 5zm0 7l9-5-9-5-9 5 9 5z' },
  { key: 'quizgen', label: '3-Tier Quiz Wizard', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { key: 'quizreview', label: 'Quiz Review', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { key: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

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

function getInitials(name?: string) {
  if (!name) return 'LE'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [activeReviewTier, setActiveReviewTier] = useState<'Foundational' | 'Intermediate' | 'Mastery'>('Foundational')
  const [publishing, setPublishing] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<{ tier: string; index: number; question: any } | null>(null)

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
      openDate: new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16),
      closeDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      passingScore: 60,
      attempts: 1,
    },
    Intermediate: {
      questionCount: 10,
      timeLimit: 30,
      openDate: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      closeDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      passingScore: 60,
      attempts: 1,
    },
    Mastery: {
      questionCount: 10,
      timeLimit: 45,
      openDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      closeDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      passingScore: 70,
      attempts: 1,
    },
  })

  const [approved, setApproved] = useState<number[]>([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [genCourse, setGenCourse] = useState('')
  const [genCount, setGenCount] = useState('10')
  const [genQuestionTypes, setGenQuestionTypes] = useState<string[]>(['MCQ', 'True/False', 'Fill in the Blank', 'Short Answer'])
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
  const [savedUser, setSavedUser] = useState<Record<string, any> | null>(() =>
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : null,
  )

  const getActiveTier = () => activeReviewTier

  const [myCoursesState, setMyCoursesState] = useState<any[]>([])
  const [materialsState, setMaterialsState] = useState<any[]>([])
  const [studentsState, setStudentsState] = useState<any[]>([])
  const [generatedState, setGeneratedState] = useState<any[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadLecturerData = async () => {
    if (typeof window !== 'undefined') {
      setSavedUser(JSON.parse(localStorage.getItem('tmas-user') || 'null'))
    }

    const storedUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : savedUser
    const lecturerName = String(storedUser?.name || '').trim()
    if (!lecturerName) return
    try {
      const [coursesRes, materialsRes, studentsRes, quizzesRes] = await Promise.all([
        fetch(`${API_BASE}/api/courses?lecturer=${encodeURIComponent(lecturerName)}`),
        fetch(`${API_BASE}/api/materials?lecturer=${encodeURIComponent(lecturerName)}`),
        fetch(`${API_BASE}/api/dashboard/students?lecturer=${encodeURIComponent(lecturerName)}`),
        fetch(`${API_BASE}/api/quizzes/available`),
      ])

      let fetchedCourses: any[] = []
      if (coursesRes.ok) {
        const data = await coursesRes.json()
        fetchedCourses = data.courses || []
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

      if (quizzesRes.ok) {
        const data = await quizzesRes.json()
        // Do not overwrite generatedState here as it holds draft AI quiz questions being reviewed by the lecturer
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
    const cleanGenCourse = genCourse.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    return materialsState.filter(m => {
      const matCourse = (m.course || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      return !matCourse || matCourse === cleanGenCourse || matCourse.includes(cleanGenCourse) || cleanGenCourse.includes(matCourse)
    })
  }, [materialsState, genCourse])

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
        setUploadMessage({ type: 'error', text: errorBody?.detail || response.statusText })
        return
      }

      const data = await response.json()
      setSelectedFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      setUploadMessage({ type: 'success', text: `Uploaded ${data.materials.length} material${data.materials.length === 1 ? '' : 's'} successfully.` })

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

  const handleGenerate3TierBank = async () => {
    if (!genCourse) {
      alert('Please select a course before generating quiz questions.')
      return
    }
    setGenerating(true)
    setGenerated(false)
    try {
      const payload = {
        course: genCourse,
        question_count: Number(genCount) || 10,
        generate_all_tiers: true,
        question_types: genQuestionTypes,
        material_ids: selectedMaterialId ? [Number(selectedMaterialId)] : [],
      }

      const res = await fetch(`${API_BASE}/api/quizzes/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText)
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
      setGenerated(true)
      setWizardStep(2) // Advance automatically to Step 2 Review!
    } catch (err: any) {
      console.error('Quiz bank generation failed', err)
      alert(`Quiz generation failed: ${err.message || 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish3TierSequence = async () => {
    if (!genCourse) return
    setPublishing(true)

    try {
      const quizzesToPublish = (['Foundational', 'Intermediate', 'Mastery'] as const).map(tier => {
        const config = tierScheduleConfigs[tier]
        const questions = generatedQuestionsByTier[tier] || []

        return {
          title: `AI Generated ${tier} Quiz for ${genCourse}`,
          course: genCourse,
          tier: tier,
          questions: questions.map((q: any) => ({
            question: q.question,
            options: q.options || [],
            answer: q.answer,
            explanation: q.explanation || '',
          })),
          time_limit: Number(config.timeLimit) || 30,
          passing_score: Number(config.passingScore) || 60,
          attempts: Number(config.attempts) || 1,
          open_date: new Date(config.openDate).toISOString(),
          close_date: new Date(config.closeDate).toISOString(),
          due_date: new Date(config.closeDate).toISOString(),
          material_ids: selectedMaterialId ? [Number(selectedMaterialId)] : [],
        }
      })

      const res = await fetch(`${API_BASE}/api/quizzes/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quizzes: quizzesToPublish }),
      })

      if (!res.ok) throw new Error((await res.json()).detail || res.statusText)

      try {
        const { dispatchPushNotification } = await import('../utils/notifications')
        await dispatchPushNotification({
          title: `New 3-Tier Quiz Sequence Published`,
          message: `3 Quiz Tiers (Foundational, Intermediate, Mastery) published for ${genCourse}.`,
          target_role: 'student',
          type: 'info',
        })
      } catch {}

      alert(`🎉 Success! All 3 Quiz Tiers (Foundational, Intermediate, Mastery) have been scheduled and published for ${genCourse}!`)
      setWizardStep(1)
      setGenerated(false)
    } catch (err: any) {
      alert(`Publishing failed: ${err.message}`)
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
        alert(`Failed to clear quizzes: ${err.detail || res.statusText}`)
        return
      }
      alert('✅ All quizzes, questions, and attempts have been cleared successfully.')
      setGenerated(false)
      setWizardStep(1)
      setGeneratedQuestionsByTier({ Foundational: [], Intermediate: [], Mastery: [] })
      setApprovedByTier({ Foundational: [], Intermediate: [], Mastery: [] })
      await loadLecturerData()
    } catch (err: any) {
      alert(`Error clearing quizzes: ${err.message}`)
    } finally {
      setClearingQuizzes(false)
    }
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
      students: studentsState.filter(student => student.level === course.level && student.program === course.program),
    }))
    const uniqueStudentCount = new Set(studentsState.map(student => student.id)).size
    const totalStudents = uniqueStudentCount
    const studentHeadcount = studentsByCourse.reduce((s, entry) => s + entry.students.length, 0)
    const avgQuizScore = myCoursesState.length ? Math.round(myCoursesState.reduce((s, c) => s + (c.avgScore || 0), 0) / myCoursesState.length) : null
    const levelsStr = Array.from(new Set(myCoursesState.map(c => c.level).filter(Boolean))).slice(0, 2).join(', ')
    const pendingReviews = generatedState.filter(q => !approved.includes(q.id)).length
    const highestCompletionCourse = myCoursesState.slice().sort((a, b) => (b.completion || 0) - (a.completion || 0))[0]
    const atRiskStudents = myCoursesState.reduce((acc, c) => acc + ((c.completion || 0) < 50 ? (c.students || 0) : 0), 0)
  
    // difficulty stats derived from generated questions
    const difficultyGroups = generatedState.reduce((map: Record<string, any[]>, q) => {
      const k = q.difficulty || 'Medium'
      map[k] = map[k] || []
      map[k].push(q)
      return map
    }, {} as Record<string, any[]>)

    const difficultyStats = ['Easy', 'Medium', 'Hard'].map(level => {
      const list = difficultyGroups[level] || []
      const count = list.length
      const approvedCount = list.filter(q => approved.includes(q.id)).length
      const correct = count > 0 ? Math.round((approvedCount / count) * 100) : 0
      const color = level === 'Easy' ? 'bg-success' : level === 'Medium' ? 'bg-warning' : 'bg-danger'
      return { level, count, correct, color }
    })

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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
                {item.key === 'quizreview' && generatedState.filter(q => !approved.includes(q.id)).length > 0 && (
                  <span className="ml-auto bg-accent text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {generatedState.filter(q => !approved.includes(q.id)).length}
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden text-muted-foreground hover:text-foreground p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="text-foreground font-semibold text-sm">
              {tab === 'overview' ? 'My Dashboard' : tab === 'courses' ? 'My Teaching Assignments' : tab === 'materials' ? 'Learning Materials' : tab === 'quizgen' ? 'AI Quiz Generator' : tab === 'quizreview' ? 'Quiz Review' : 'Course Analytics'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const { requestPushPermission, triggerWebPushNotification, playNotificationChime } = await import('../utils/notifications')
                const granted = await requestPushPermission()
                triggerWebPushNotification('🔔 TMAS Push Notification System Active!', {
                  body: 'Web Push alerts and real-time notification engine are fully working on your device.',
                })
                playNotificationChime()
                alert(granted ? '🔔 Browser Push Notification Dispatched! Check your desktop/mobile notifications.' : '🔔 Sound chime played! (Enable browser notification permissions to see desktop popups).')
              }}
              className="flex items-center gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-full transition-colors"
              title="Test Instant Web Push Notification"
            >
              <Icon name="bolt" size={12} />
              <span>Test Push</span>
            </button>
            <span className="text-xs bg-success/10 text-success px-3 py-1 rounded-full font-semibold">Account Active</span>
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

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Assigned Courses', val: String(assignedCourses), sub: levelsStr || '—', color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Assigned Students', val: String(totalStudents), sub: `${studentHeadcount} course seats`, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Avg Quiz Score', val: avgQuizScore !== null ? `${avgQuizScore}%` : '—', sub: 'This semester', color: 'text-success', bg: 'bg-green-50' },
                    { label: 'Pending Reviews', val: String(pendingReviews), sub: 'Questions to approve', color: 'text-accent', bg: 'bg-amber-50' },
                  ].map((s, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-5">
                      <div className={`inline-flex p-2 rounded-xl ${s.bg} mb-3`}>
                        <div className="w-4 h-4" />
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
                    <div key={i} className="bg-card border border-border rounded-2xl p-5">
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
                          { label: 'Students', val: c.students },
                          { label: 'Materials', val: c.materials },
                          { label: 'Quizzes', val: c.quizzes },
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
                      { label: 'Review Questions', desc: `${generatedState.filter(q => !approved.includes(q.id)).length} pending approval`, action: () => setTab('quizreview'), icon: 'clipboard' },
                      { label: 'View Analytics', desc: 'Student performance data', action: () => setTab('analytics'), icon: 'analytics' },
                    ].map((qa, i) => (
                      <button key={i} onClick={qa.action} className="w-full flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all text-left group">
                        <span className="text-xl"><Icon name={qa.icon} /></span>
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
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Code', 'Title', 'Level', 'Program', 'Students', 'Progress', 'Avg Score', 'Status'].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myCoursesState.map(course => {
                        const courseStudents = studentsByCourse.find(entry => entry.course.code === course.code)?.students ?? []
                        return (
                          <tr key={course.code} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-4 text-foreground font-mono font-semibold text-sm">{course.code}</td>
                            <td className="px-5 py-4 text-foreground text-sm">{course.title}</td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{course.level || '—'}</td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{course.program || '—'}</td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{courseStudents.length}</td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{course.progress ?? 0}%</td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{course.avg_score ?? course.avgScore ?? 0}%</td>
                            <td className="px-5 py-4 text-sm"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${course.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{course.status || 'active'}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── MATERIALS ── */}
          {tab === 'materials' && (
            <div className="space-y-6">
              <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-primary/40 transition-colors group">
                <div className="text-4xl mb-3"><Icon name="upload" size={40} /></div>
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
                  <h3 className="font-semibold text-foreground">Uploaded Materials</h3>
                  <span className="text-xs text-muted-foreground">{materialsState.length} files</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['File Name', 'Course', 'Size', 'Uploaded', 'AI Status', 'Quiz'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {materialsState.map(m => (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{m.name.endsWith('.pdf') ? <Icon name="document" /> : m.name.endsWith('.pptx') ? <Icon name="analytics" /> : <Icon name="document" />}</span>
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
                            ? <span className="text-xs text-success font-semibold">✓ Generated</span>
                            : <button onClick={() => setTab('quizgen')} className="text-xs text-primary hover:underline font-medium">Generate</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <span className="text-xs text-muted-foreground">{uniqueStudentCount} unique students</span>
                </div>
              </div>

              {studentsByCourse.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
                  No student assignments found yet. Once you are assigned to a course, students enrolled in that course will appear here.
                </div>
              ) : (
                <div className="space-y-4">
                  {studentsByCourse.map(({ course, students }) => (
                    <div key={course.code} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{course.code} — {course.title}</p>
                          <p className="text-xs text-muted-foreground">{course.level || '—'} · {course.program || '—'}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{students.length} student{students.length === 1 ? '' : 's'}</span>
                      </div>
                      {students.length === 0 ? (
                        <div className="px-6 py-5 text-sm text-muted-foreground">No students currently enrolled in this course assignment.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/40">
                              {['Name', 'Email', 'Level', 'Program', 'Status'].map(h => (
                                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {students.map(student => (
                              <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-5 py-4 text-foreground font-semibold">{student.name}</td>
                                <td className="px-5 py-4 text-muted-foreground text-xs">{student.email}</td>
                                <td className="px-5 py-4 text-muted-foreground text-xs">{student.level || '—'}</td>
                                <td className="px-5 py-4 text-muted-foreground text-xs">{student.program || '—'}</td>
                                <td className="px-5 py-4"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${student.status === 'active' ? 'bg-success/10 text-success' : student.status === 'suspended' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}>{student.status || 'active'}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 3-FOLD AI QUIZ STEPPER WIZARD ── */}
          {(tab === 'quizgen' || tab === 'quizreview') && (
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
                        <option value="">All Uploaded Materials ({filteredMaterialsForCourse.length} indexed)</option>
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
                        className="w-32 px-4 py-3 bg-muted border border-border rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                    <button
                      onClick={() => setWizardStep(3)}
                      className="bg-primary hover:bg-blue-950 text-white font-semibold text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto"
                    >
                      <span>Proceed to Schedule</span>
                      <i className="fa-solid fa-arrow-right text-xs" />
                    </button>
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

                            <button
                              onClick={() => {
                                const currentApproved = approvedByTier[activeReviewTier] || []
                                const updated = isApproved ? currentApproved.filter(id => id !== q.id) : [...currentApproved, q.id]
                                setApprovedByTier(prev => ({ ...prev, [activeReviewTier]: updated }))
                              }}
                              className={`self-start sm:self-auto px-3 sm:px-4 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 ${
                                isApproved ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 border-border'
                              }`}
                            >
                              <i className={`fa-solid ${isApproved ? 'fa-check' : 'fa-plus'}`} />
                              <span>{isApproved ? 'Approved' : 'Approve'}</span>
                            </button>
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
                              <span>{tier === 'Foundational' ? '🟢' : tier === 'Intermediate' ? '🟡' : '🟣'}</span>
                              <span>{tier} Tier</span>
                            </h4>
                            <span className="text-xs font-mono font-bold bg-muted px-2.5 py-1 rounded-lg">
                              {(generatedQuestionsByTier[tier] || []).length} Items Available
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Attempt Duration (Mins)</label>
                            <input
                              type="number"
                              value={cfg.timeLimit}
                              onChange={e => {
                                const val = Number(e.target.value)
                                setTierScheduleConfigs(prev => ({
                                  ...prev,
                                  [tier]: { ...prev[tier], timeLimit: val },
                                }))
                              }}
                              min={5}
                              max={180}
                              className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm font-bold font-mono"
                            />
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
                              }}
                              className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-xs font-medium"
                            />
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
                              }}
                              className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-xs font-medium"
                            />
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
                </div>
              )}
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
                  <Icon name="download" size={14} />
                  <span>Export Gradebook (CSV)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Avg Quiz Score', val: avgQuizScore !== null ? `${avgQuizScore}%` : '—', trend: 'Across all courses' },
                  { label: 'Highest Completion', val: highestCompletionCourse ? highestCompletionCourse.code : '—', trend: highestCompletionCourse ? `${highestCompletionCourse.completion}% complete` : '—' },
                  { label: 'Pass Rate', val: avgQuizScore !== null ? `${avgQuizScore}%` : '—', trend: 'This semester' },
                  { label: 'At-Risk Students', val: String(atRiskStudents), trend: 'Below 50% completion' },
                ].map((s, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">{s.label}</p>
                    <p className="text-2xl font-bold font-mono text-foreground">{s.val}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.trend}</p>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-semibold text-foreground mb-5">Score Distribution by Course</h3>
                  <div className="space-y-5">
                    {myCoursesState.map((c, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-foreground font-mono">{c.code}</span>
                          <span className="text-sm font-bold font-mono text-foreground">{c.avgScore}%</span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${c.avgScore}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">{c.students} students</span>
                          <span className="text-xs text-muted-foreground">{c.completion}% completion</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-semibold text-foreground mb-5">Question Difficulty Analysis</h3>
                  <div className="space-y-3">
                    {difficultyStats.map((d, i) => (
                      <div key={i} className="bg-muted/40 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">{d.level}</span>
                          <span className="text-xs text-muted-foreground">{d.count} questions · {d.correct}% avg correct</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.correct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
