import { useEffect, useState, useRef, useMemo } from 'react'
import Icon from '../components/Icon'
import type { AppView } from '../App'
import CourseModal, { type CourseFormValues } from '../components/CourseModal'
import ProfileModal from '../components/ProfileModal'
import { API_BASE } from '../config'
import { dismissNotificationIds, getDismissedNotificationIds } from '../utils/notificationDismissal'

type Tab = 'overview' | 'levels' | 'courses' | 'lecturers' | 'students' | 'analytics'

const navItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'levels', label: 'Academic Levels', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { key: 'courses', label: 'Courses', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { key: 'lecturers', label: 'Lecturers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'students', label: 'Students', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { key: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

function formatRelativeTime(iso?: string): string {
  if (!iso) return 'Recently'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Recently'
  const diffMs = Date.now() - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

function Badge({ children, variant }: { children: React.ReactNode; variant: 'success' | 'warning' | 'danger' | 'default' }) {
  const cls = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    default: 'bg-secondary text-secondary-foreground',
  }[variant]
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{children}</span>
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-success' : value >= 60 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  )
}

export default function Admin({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  // Read fresh on every mount (not module load) — the previous module-level constant was
  // evaluated once when the bundle first loaded, which could freeze in whichever account
  // (e.g. a student) was logged in at that moment and never update after logging in as admin.
  const [savedUser, setSavedUser] = useState<Record<string, any> | null>(() =>
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tmas-user') || 'null') : null,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    setSavedUser(JSON.parse(localStorage.getItem('tmas-user') || 'null'))
  }, [])

  const [tab, setTab] = useState<Tab>('overview')
  const [lecturerSubTab, setLecturerSubTab] = useState<'pending' | 'approved'>('pending')
  const [levelFilter, setLevelFilter] = useState('All Levels')
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [levels, setLevels] = useState<Array<{ id: string; name: string; order: number; status: string; created_at?: string }>>([])
  const [newLevelName, setNewLevelName] = useState('')
  const [newLevelOrder, setNewLevelOrder] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isSavingLevel, setIsSavingLevel] = useState(false)
  const [actionLoadingLecturerIds, setActionLoadingLecturerIds] = useState<string[]>([])

  const [students, setStudents] = useState<Array<{ id: string; name: string; email: string; level?: string; role: string; status: string; created_at?: string; courses?: number; completion?: number; enrolled?: number }>>([])
  const [dashboardLecturers, setDashboardLecturers] = useState<Array<{ id: string; name: string; email: string; role: string; status: string; program?: string; created_at?: string }>>([])
  const [allCourses, setAllCourses] = useState<Array<{ id?: string; code: string; title: string; level: string; lecturer: string; enrolled: number; status: string; avgScore: number; progress: number; materials: number }>>([])
  const [materialsCount, setMaterialsCount] = useState(0)
  const [recentMaterials, setRecentMaterials] = useState<Array<{ name: string; course?: string; uploaded?: string }>>([])
  const [availableQuizzesCount, setAvailableQuizzesCount] = useState(0)
  const [completedQuizzesCount, setCompletedQuizzesCount] = useState(0)
  const [quizStats, setQuizStats] = useState<{ total_quizzes: number; quizzes_with_completions: number } | null>(null)
  const [courseModalOpen, setCourseModalOpen] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<CourseFormValues | null>(null)
  const [courseModalError, setCourseModalError] = useState('')
  const [isSavingCourse, setIsSavingCourse] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [selectedLecturerIds, setSelectedLecturerIds] = useState<string[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvRawText, setCsvRawText] = useState('')
  const [isImportingCsv, setIsImportingCsv] = useState(false)
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false)
  const [announcementMsg, setAnnouncementMsg] = useState('')
  const [announcementTarget, setAnnouncementTarget] = useState('All Users')

  async function handleBulkLecturers(status: 'active' | 'rejected') {
    if (!selectedLecturerIds.length) return
    if (!window.confirm(`Are you sure you want to ${status === 'active' ? 'approve' : 'reject'} ${selectedLecturerIds.length} lecturer registration(s)?`)) return
    for (const id of selectedLecturerIds) {
      await setLecturerStatus(id, status)
    }
    setSelectedLecturerIds([])
  }

  async function handleBulkArchiveCourses() {
    if (!selectedCourseIds.length) return
    if (!window.confirm(`Are you sure you want to archive ${selectedCourseIds.length} selected course(s)?`)) return
    for (const id of selectedCourseIds) {
      try {
        await fetch(`${API_BASE}/api/courses/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'archived' }),
        })
      } catch {}
    }
    setAllCourses(prev => prev.map(c => selectedCourseIds.includes(c.id || '') ? { ...c, status: 'archived' } : c))
    setSelectedCourseIds([])
  }

  async function handleImportCsvStudents() {
    if (!csvRawText.trim()) return
    setIsImportingCsv(true)
    const lines = csvRawText.split('\n').filter(l => l.trim())
    let count = 0
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim())
      if (parts.length >= 2) {
        const name = parts[0]
        const email = parts[1]
        const level = parts[2] || 'Level 100'
        const program = parts[3] || 'Computer Science'
        try {
          await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name,
              email,
              password: 'Password123!',
              role: 'student',
              level,
              program,
            }),
          })
          count++
        } catch (err) {}
      }
    }
    setIsImportingCsv(false)
    setCsvModalOpen(false)
    setCsvRawText('')
    alert(`Successfully imported ${count} student(s)!`)
    const res = await fetch(`${API_BASE}/api/dashboard/students`)
    if (res.ok) {
      const d = await res.json()
      if (Array.isArray(d.students)) setStudents(d.students)
    }
  }

  async function handleBroadcastAnnouncement() {
    if (!announcementMsg.trim()) return
    const targetRole = announcementTarget === 'Students Only' ? 'student' : announcementTarget === 'Lecturers Only' ? 'lecturer' : 'all'
    try {
      const { dispatchPushNotification } = await import('../utils/notifications')
      await dispatchPushNotification({
        title: 'Institutional Announcement',
        message: announcementMsg,
        target_role: targetRole,
        type: 'warning',
      })
    } catch {}
    alert(`Announcement broadcast sent to ${announcementTarget}!`)
    setAnnouncementModalOpen(false)
    setAnnouncementMsg('')
  }

  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; type?: string; read?: boolean; created_at?: string }>>([])
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
  const seenNotifIdsRef = useRef<Set<string>>(new Set())
  const isInitialNotifLoadRef = useRef(true)

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [studentsRes, lecturersRes, levelsRes, coursesRes, materialsRes, availableQuizzesRes, completedQuizzesRes, notifRes] = await Promise.all([
          fetch(`${API_BASE}/api/dashboard/students`),
          fetch(`${API_BASE}/api/dashboard/lecturers`),
          fetch(`${API_BASE}/api/levels`),
          fetch(`${API_BASE}/api/courses`),
          fetch(`${API_BASE}/api/materials`),
          fetch(`${API_BASE}/api/quizzes/available`),
          fetch(`${API_BASE}/api/quizzes/completed`),
          fetch(`${API_BASE}/api/notifications?role=admin`),
        ])

        if (studentsRes.ok) {
          const data = await studentsRes.json()
          if (Array.isArray(data.students)) setStudents(data.students)
        }
        if (lecturersRes.ok) {
          const data = await lecturersRes.json()
          if (Array.isArray(data.lecturers)) setDashboardLecturers(data.lecturers)
        }
        if (levelsRes.ok) {
          const data = await levelsRes.json()
          if (Array.isArray(data.levels)) setLevels(data.levels)
        }
        if (coursesRes.ok) {
          const data = await coursesRes.json()
          if (Array.isArray(data.courses)) setAllCourses(data.courses.map((course: any) => ({
            id: course.id,
            code: course.code ?? `COURSE-${course.id}`,
            title: course.title,
            level: course.level ?? 'N/A',
            program: course.program ?? '',
            lecturer: course.lecturer ?? 'Unassigned',
            enrolled: Number(course.student_count ?? course.enrolled ?? course.progress ?? 0),
            status: course.status ?? 'active',
            avgScore: Number(course.avg_score ?? 0),
            progress: Number(course.progress ?? 0),
            materials: Number(course.materials ?? 0),
            quizzes_total: Number(course.quizzes_total ?? 0),
          })))
        }

        if (materialsRes.ok) {
          const data = await materialsRes.json()
          if (Array.isArray(data.materials)) {
            setMaterialsCount(data.materials.length)
            setRecentMaterials(data.materials.map((m: any) => ({ name: m.name, course: m.course, uploaded: m.uploaded })))
          }
        }

        if (availableQuizzesRes.ok) {
          const data = await availableQuizzesRes.json()
          if (Array.isArray(data.quizzes)) setAvailableQuizzesCount(data.quizzes.length)
        }

        if (completedQuizzesRes.ok) {
          const data = await completedQuizzesRes.json()
          if (Array.isArray(data.quizzes)) setCompletedQuizzesCount(data.quizzes.length)
        }

        const quizStatsRes = await fetch(`${API_BASE}/api/quizzes/stats`)
        if (quizStatsRes.ok) setQuizStats(await quizStatsRes.json())

        if (notifRes.ok) {
          const data = await notifRes.json()
          const list = data.notifications || []
          setNotifications(list)

          // Trigger push notification popups for new incoming notifications
          let hasNew = false
          for (const n of list) {
            if (!seenNotifIdsRef.current.has(n.id)) {
              seenNotifIdsRef.current.add(n.id)
              if (!isInitialNotifLoadRef.current) {
                hasNew = true
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
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      }
    }

    loadDashboard()
    const interval = setInterval(loadDashboard, 10000)
    return () => clearInterval(interval)
  }, [])

  const pendingLecturers = dashboardLecturers.filter(l => l.status === 'pending').map(l => ({
    id: l.id,
    name: l.name,
    email: l.email,
    dept: l.program || 'Unknown',
    applied: l.created_at ? new Date(l.created_at).toLocaleDateString() : 'Recently',
  }))

  const approvedLecturers = dashboardLecturers.filter(l => l.status === 'active' || l.status === 'suspended').map(l => ({
    id: l.id,
    name: l.name,
    email: l.email,
    dept: l.program || 'Unassigned',
    courses: 0,
    students: 0,
    status: l.status || 'active',
    lastActive: l.created_at ? new Date(l.created_at).toLocaleDateString() : 'Today',
  }))

  const visiblePending = pendingLecturers
  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning,'
    if (hour < 17) return 'Good afternoon,'
    return 'Good evening,'
  })()

  const totalStudents = students.length
  const activeCourses = allCourses.filter(course => course.status.toLowerCase() === 'active').length
  const avgCourseScore = allCourses.length ? Math.round(allCourses.reduce((sum, course) => sum + course.avgScore, 0) / allCourses.length) : 0
  const materialsUploaded = materialsCount
  const inactiveStudents = students.filter(student => student.status !== 'active').length
  // `/quizzes/completed` is per-student (needs a student_id), so it always returns empty
  // for an admin-scoped call — `/quizzes/stats` is the real institution-wide aggregate:
  // how many of all published quizzes have at least one completed student attempt.
  const totalQuizCount = quizStats?.total_quizzes ?? 0
  const quizzesCompletedCount = quizStats?.quizzes_with_completions ?? 0
  const quizCompletionRate = totalQuizCount ? Math.round((quizzesCompletedCount / totalQuizCount) * 100) : 0
  const quizTrend = totalQuizCount ? `${quizzesCompletedCount} completed / ${totalQuizCount} total` : 'No quizzes available yet'
  const coursesByLevel = levels.map(level => {
    const levelCourses = allCourses.filter(course => course.level === level.name)
    const levelStudents = students.filter(student => student.level === level.name)
    return {
      id: level.id,
      level: level.name,
      courseCount: levelCourses.length,
      studentCount: levelStudents.length,
      percentage: totalStudents ? Math.round((levelStudents.length / totalStudents) * 100) : 0,
      status: level.status,
      created_at: level.created_at,
      order: level.order,
    }
  })
  // Real completion rate per level: average of the (already class-wide-real) per-course
  // completion percentage for courses taught at that level — not a population share.
  const studentsByLevel = coursesByLevel.map(group => {
    const levelCourses = allCourses.filter(c => c.level === group.level)
    const avgCompletion = levelCourses.length
      ? Math.round(levelCourses.reduce((sum, c) => sum + (c.progress || 0), 0) / levelCourses.length)
      : 0
    return {
      level: group.level,
      count: group.studentCount,
      percentage: avgCompletion,
    }
  })
  const topCourses = [...allCourses]
    .sort((a, b) => b.avgScore - a.avgScore || b.progress - a.progress)
    .slice(0, 5)

  // Real per-student enrollment/completion: courses enrolled = courses at the student's
  // level; completion = average of those courses' real (class-wide) completion rate.
  // There's no per-student join table, so this mirrors the same level-based matching used
  // everywhere else in this codebase (course monitor, dashboards) rather than a fabricated 0.
  const studentsWithStats = useMemo(() => {
    return students.map(s => {
      const sLevel = String(s.level || '').trim().toLowerCase()
      const matchingCourses = sLevel ? allCourses.filter(c => String(c.level || '').trim().toLowerCase() === sLevel) : []
      const avgCompletion = matchingCourses.length
        ? Math.round(matchingCourses.reduce((sum, c) => sum + (c.progress || 0), 0) / matchingCourses.length)
        : 0
      return { ...s, courses: matchingCourses.length, completion: avgCompletion }
    })
  }, [students, allCourses])

  const studentsGroupedByLevel = useMemo(() => {
    const filtered = studentsWithStats.filter(s =>
      !searchQuery || `${s.name} ${s.email} ${s.level}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const groups: Record<string, typeof filtered> = {}
    for (const s of filtered) {
      const key = s.level || 'Unassigned'
      groups[key] = groups[key] || []
      groups[key].push(s)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [studentsWithStats, searchQuery])

  // A real, chronologically-sorted activity feed built from actual registration and
  // upload timestamps, instead of static counts labeled "Today"/"This week" regardless
  // of when anything actually happened.
  const recentActivity = [
    ...dashboardLecturers
      .filter(l => l.created_at)
      .map(l => ({
        icon: 'robot',
        text: `${l.name} registered as a lecturer${l.status === 'pending' ? ' (awaiting approval)' : ''}`,
        time: l.created_at as string,
        color: 'bg-blue-100 text-blue-700',
      })),
    ...students
      .filter(s => s.created_at)
      .map(s => ({
        icon: 'trophy',
        text: `${s.name} registered as a student${s.level ? ` (${s.level})` : ''}`,
        time: s.created_at as string,
        color: 'bg-purple-100 text-purple-700',
      })),
    ...recentMaterials
      .filter(m => m.uploaded)
      .map(m => ({
        icon: 'book',
        text: `New material "${m.name}" uploaded${m.course ? ` for ${m.course}` : ''}`,
        time: m.uploaded as string,
        color: 'bg-green-100 text-green-700',
      })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8)
    .map(a => ({ ...a, time: formatRelativeTime(a.time) }))

  async function setLecturerStatus(lecturerId: string, status: 'active' | 'rejected' | 'suspended') {
    setActionLoadingLecturerIds(ids => [...ids, lecturerId])
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/lecturers/${lecturerId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Could not update lecturer status')
      }

      setDashboardLecturers(prev => prev.map(lecturer =>
        lecturer.id === lecturerId ? { ...lecturer, status } : lecturer,
      ))

      try {
        const { dispatchPushNotification } = await import('../utils/notifications')
        if (status === 'active') {
          await dispatchPushNotification({
            title: 'Account Approved / Reinstated!',
            message: 'Your lecturer account status is active. You can now access the portal.',
            target_role: 'lecturer',
            type: 'success',
          })
        } else if (status === 'suspended') {
          await dispatchPushNotification({
            title: 'Account Suspended',
            message: 'Your lecturer account has been suspended by Administrator.',
            target_role: 'lecturer',
            type: 'danger',
          })
        }
      } catch {}
    } catch (error) {
      console.error('Failed to update lecturer status', error)
    } finally {
      setActionLoadingLecturerIds(ids => ids.filter(id => id !== lecturerId))
    }
  }

  async function handleCreateLevel() {
    if (!newLevelName.trim()) {
      setStatusMessage('Please enter a level name')
      return
    }

    setIsSavingLevel(true)
    setStatusMessage('')

    try {
      const response = await fetch(`${API_BASE}/api/levels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newLevelName.trim(), order: Number(newLevelOrder || levels.length + 1), status: 'active' }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Could not create level')
      }

      setLevels(prev => [data.level, ...prev])
      setNewLevelName('')
      setNewLevelOrder('')
      setStatusMessage(`Created ${data.level.name}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not create level')
    } finally {
      setIsSavingLevel(false)
    }
  }

  function openCourseModal(course?: CourseFormValues) {
    setSelectedCourse(course ?? null)
    setCourseModalError('')
    setCourseModalOpen(true)
  }

  async function handleSaveCourse(course: CourseFormValues) {
    setIsSavingCourse(true)
    setCourseModalError('')

    // Captured before the request so it reflects who was assigned *before* this save —
    // used below to only alert a lecturer when they're newly assigned, not on every
    // unrelated edit to a course they already teach.
    const previousLecturer = course.id ? allCourses.find(c => c.id === course.id)?.lecturer ?? '' : ''

    try {
      const endpoint = course.id ? `${API_BASE}/api/courses/${course.id}` : `${API_BASE}/api/courses`
      const method = course.id ? 'PATCH' : 'POST'
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: course.code,
          title: course.title,
          level: course.level,
          lecturer: course.lecturer,
          status: course.status,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not save course')

      const savedCourse = data.course ?? data
      const normalizedCourse = {
        id: savedCourse.id ?? course.id,
        code: savedCourse.code ?? course.code,
        title: savedCourse.title ?? course.title,
        level: savedCourse.level ?? course.level,
        program: savedCourse.program ?? (course as any).program ?? '',
        lecturer: (savedCourse.lecturer ?? course.lecturer) || 'Unassigned',
        enrolled: Number(savedCourse.student_count ?? savedCourse.enrolled ?? savedCourse.progress ?? 0),
        status: savedCourse.status ?? course.status,
        avgScore: Number(savedCourse.avg_score ?? savedCourse.avgScore ?? 0),
        progress: Number(savedCourse.progress ?? 0),
        materials: Number(savedCourse.materials ?? 0),
        quizzes_total: Number(savedCourse.quizzes_total ?? 0),
      }

      setAllCourses(prev => {
        if (course.id) {
          return prev.map(c => (c.id === course.id ? normalizedCourse : c))
        }
        return [normalizedCourse, ...prev]
      })
      setCourseModalOpen(false)
      setSelectedCourse(null)

      const assignedLecturer = String(normalizedCourse.lecturer || '').trim()
      if (assignedLecturer && assignedLecturer !== 'Unassigned' && assignedLecturer !== previousLecturer.trim()) {
        try {
          const { dispatchPushNotification } = await import('../utils/notifications')
          await dispatchPushNotification({
            title: 'New Course Assignment',
            message: `${assignedLecturer}, you have been assigned to teach ${normalizedCourse.code} — ${normalizedCourse.title}.`,
            target_role: 'lecturer',
            type: 'info',
          })
        } catch {}
      }
    } catch (err) {
      setCourseModalError(err instanceof Error ? err.message : 'Could not save course')
      console.error('Save course failed', err)
    } finally {
      setIsSavingCourse(false)
    }
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
              <p className="text-sidebar-muted text-xs">UENR</p>
            </div>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden text-sidebar-muted hover:text-sidebar-foreground p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <p className="text-sidebar-muted text-xs font-semibold uppercase tracking-widest px-3 mb-3">Administration</p>
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
                {item.key === 'lecturers' && visiblePending.length > 0 && (
                  <span className="ml-auto bg-accent text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{visiblePending.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-4 py-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{savedUser?.name ? savedUser.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'AD'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-foreground text-xs font-semibold truncate">{savedUser?.name || 'System Administrator'}</p>
              <p className="text-sidebar-muted text-xs truncate">{savedUser?.email || 'med3719@gmail.com'}</p>
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

        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden text-muted-foreground hover:text-foreground p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="text-foreground font-semibold text-sm capitalize hidden sm:block">
              {tab === 'overview' ? 'Dashboard Overview' : tab === 'levels' ? 'Academic Levels' : tab === 'courses' ? 'Course Management' : tab === 'lecturers' ? 'Lecturer Management' : tab === 'students' ? 'Student Management' : 'Analytics'}
            </h1>
          </div>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name, email, course code, level..."
                className="w-full pl-9 pr-4 py-1.5 bg-muted/70 border border-border rounded-xl text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <svg className="w-4 h-4 text-muted-foreground absolute left-3 top-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
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
              className="flex items-center gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2.5 sm:px-3 py-1.5 rounded-xl transition-colors shrink-0"
              title="Test Instant Web Push Notification"
            >
              <Icon name="bolt" size={14} />
              <span className="hidden sm:inline">Test Push</span>
            </button>
            <button
              onClick={() => setAnnouncementModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 px-2.5 sm:px-3 py-1.5 rounded-xl transition-colors shrink-0"
              title="Broadcast Announcement"
            >
              <Icon name="celebrate" size={14} />
              <span className="hidden sm:inline">Broadcast</span>
            </button>
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {visibleNotifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent"></span>
                )}
              </button>
              {notifOpen && (
                <>
                  {/* Invisible overlay so clicking anywhere outside the panel closes it */}
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-10 w-80 bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
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
                        visibleNotifications.map((a: any, i) => {
                          // Some notification types have a clear, direct follow-up action for
                          // an admin — surface that instead of just displaying inert text.
                          const title = String(a.title || a.text || '')
                          const isLecturerRegistration = /lecturer registration/i.test(title)
                          const isCourseAssignment = /course assignment/i.test(title)
                          const action = isLecturerRegistration
                            ? () => {
                                setTab('lecturers')
                                setLecturerSubTab('pending')
                              }
                            : isCourseAssignment
                            ? () => setTab('courses')
                            : null

                          return (
                            <div
                              key={a.id || i}
                              className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors group ${action ? 'hover:bg-primary/5' : 'hover:bg-muted/50'}`}
                            >
                              <button
                                onClick={() => {
                                  action?.()
                                  dismissNotification(a.id)
                                  setNotifOpen(false)
                                }}
                                className={`flex items-start gap-3 flex-1 min-w-0 text-left ${action ? 'cursor-pointer' : ''}`}
                              >
                                <span className={`text-xs font-bold rounded-full px-2 py-1 ${a.color || 'bg-primary/10 text-primary'}`}>
                                  <Icon name={a.icon || 'bell'} size={14} />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground text-xs font-semibold leading-snug">{title || 'Notification'}</p>
                                  {a.message && <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{a.message}</p>}
                                  <div className="flex items-center justify-between mt-1">
                                    <p className="text-[10px] text-muted-foreground/70">{a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (a.time || 'Recently')}</p>
                                    {action && <span className="text-[10px] font-semibold text-primary">Review →</span>}
                                  </div>
                                </div>
                              </button>
                              <button
                                onClick={() => dismissNotification(a.id)}
                                className="shrink-0 text-muted-foreground hover:text-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Dismiss"
                              >
                                <i className="fa-solid fa-xmark text-xs" />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-8 h-8 rounded-full bg-primary hover:bg-blue-950 flex items-center justify-center transition-transform hover:scale-105 shadow-sm cursor-pointer"
              title="View Admin Profile"
            >
              <span className="text-white text-xs font-bold font-mono">
                {savedUser?.name ? savedUser.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'AD'}
              </span>
            </button>
          </div>
        </header>

        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          user={savedUser || { name: 'System Administrator', email: 'admin@tmas.com', role: 'administrator' }}
          onLogout={() => {
            localStorage.removeItem('tmas-token')
            localStorage.removeItem('tmas-user')
            onNavigate('login')
          }}
        />

        <div className="flex-1 overflow-y-auto p-3 sm:p-6">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="relative overflow-hidden bg-linear-to-br from-primary via-primary to-blue-950 rounded-2xl p-6 text-primary-foreground">
                <i className="fa-solid fa-shield-halved absolute -right-4 -bottom-6 text-[9rem] text-white/5 pointer-events-none select-none" />
                <div className="relative">
                  <p className="text-primary-foreground/70 text-sm mb-1">{greeting}</p>
                  <h2 className="font-display text-3xl text-white mb-2">{savedUser?.name || 'System Administrator'}</h2>
                  <p className="text-primary-foreground/70 text-sm">
                    Overseeing <span className="text-accent font-semibold">{activeCourses} active courses</span>
                    {visiblePending.length > 0 && <> with <span className="text-white font-semibold">{visiblePending.length} lecturer{visiblePending.length === 1 ? '' : 's'}</span> awaiting approval</>}.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { label: 'Total Students', val: String(students.length), sub: 'Current student records', color: 'text-blue-600', bg: 'bg-blue-50', icon: 'fa-users' },
                  { label: 'Active Courses', val: String(allCourses.filter(course => course.status.toLowerCase() === 'active').length), sub: 'Across all levels', color: 'text-purple-600', bg: 'bg-purple-50', icon: 'fa-book-open' },
                  { label: 'Approved Lecturers', val: String(approvedLecturers.length), sub: `${visiblePending.length} pending approval`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'fa-chalkboard-user' },
                  { label: 'Pending Approvals', val: String(visiblePending.length), sub: 'Lecturers awaiting review', color: 'text-amber-600', bg: 'bg-amber-50', icon: 'fa-hourglass-half' },
                ].map((s, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className={`inline-flex p-2.5 rounded-xl ${s.bg} mb-3`}>
                        <i className={`fa-solid ${(s as any).icon || 'fa-circle'} ${s.color} text-sm`} />
                      </div>
                      <p className="text-2xl font-bold font-mono text-foreground">{s.val}</p>
                      <p className="text-sm font-medium text-foreground mt-0.5">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                    </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Pending Lecturer Approvals</h3>
                    <button onClick={() => setTab('lecturers')} className="text-xs text-primary hover:underline">View all</button>
                  </div>
                  {visiblePending.length === 0 ? (
                    <div className="px-6 py-10 text-center text-muted-foreground text-sm">All caught up — no pending approvals.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {visiblePending.slice(0, 4).map(l => (
                        <div key={l.id} className="flex items-center gap-4 px-6 py-4">
                          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                            <span className="text-primary text-xs font-bold">{l.name.charAt(0)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{l.name}</p>
                            <p className="text-xs text-muted-foreground">{l.dept} · {l.applied}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setLecturerStatus(l.id, 'active')}
                              disabled={actionLoadingLecturerIds.includes(l.id)}
                              className="px-3 py-1.5 bg-success/10 hover:bg-success/20 text-success text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                            >
                              {actionLoadingLecturerIds.includes(l.id) ? 'Approving...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => setLecturerStatus(l.id, 'rejected')}
                              disabled={actionLoadingLecturerIds.includes(l.id)}
                              className="px-3 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                            >
                              {actionLoadingLecturerIds.includes(l.id) ? 'Rejecting...' : 'Reject'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-foreground text-sm">Recent Activity</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {recentActivity.length > 0 ? recentActivity.slice(0, 5).map((a, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                        <span className={`rounded-full px-2 py-1.5 ${a.color}`}><Icon name={a.icon} size={14} /></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground leading-snug">{a.text}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="px-5 py-6 text-sm text-muted-foreground">No recent activity yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Level Overview</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Courses</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Students</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enrollment %</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {coursesByLevel.map((group, i) => {
                        const pct = group.percentage
                        return (
                          <tr key={group.level || i} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-semibold text-foreground font-mono text-sm">{group.level}</td>
                            <td className="px-6 py-4 text-muted-foreground">{group.courseCount}</td>
                            <td className="px-6 py-4 text-foreground font-mono font-medium">{group.studentCount}</td>
                            <td className="px-6 py-4 w-40"><ProgressBar value={pct} /></td>
                            <td className="px-6 py-4">
                              {(() => {
                                const levelStatus = levels.find(level => level.name === group.level)?.status ?? 'active'
                                return <Badge variant={levelStatus === 'active' ? 'success' : levelStatus === 'archived' ? 'default' : 'warning'}>{levelStatus}</Badge>
                              })()}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── LEVELS ── */}
          {tab === 'levels' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">Manage the academic level structure for UENR.</p>
                <button
                  onClick={handleCreateLevel}
                  disabled={isSavingLevel}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-950 transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  {isSavingLevel ? 'Saving...' : 'Add Level'}
                </button>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    value={newLevelName}
                    onChange={e => setNewLevelName(e.target.value)}
                    placeholder="Enter level name (e.g. Level 500)"
                    className="flex-1 px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {statusMessage && <p className="text-sm text-primary">{statusMessage}</p>}
              </div>
              <div className="bg-card border border-border rounded-2xl overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['Level Name', 'Courses', 'Students', 'Status', 'Created', 'Actions'].map(h => (
                        <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {coursesByLevel.map((group, i) => (
                      <tr key={group.id || i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-foreground font-mono">{group.level}</td>
                        <td className="px-6 py-4 text-muted-foreground">{group.courseCount}</td>
                        <td className="px-6 py-4 text-foreground font-mono font-semibold">{group.studentCount}</td>
                        <td className="px-6 py-4"><Badge variant="success">{group.status}</Badge></td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">{group.created_at ? new Date(group.created_at).toLocaleDateString() : 'New'}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                const levelObj = levels.find(l => l.name === group.level) || group
                                if (!levelObj.id) return
                                const newName = window.prompt('Edit Level name', group.level)
                                if (!newName || !newName.trim()) return
                                try {
                                  const res = await fetch(`${API_BASE}/api/levels/${levelObj.id}`, {
                                    method: 'PATCH',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ name: newName.trim() }),
                                  })
                                  const d = await res.json()
                                  if (!res.ok) throw new Error(d.detail || d.error || 'Could not update level')
                                  setLevels(prev => prev.map(l => l.id === levelObj.id ? { ...l, name: newName.trim() } : l))
                                } catch (err) {
                                  console.error('Update level failed', err)
                                  window.alert(err instanceof Error ? err.message : 'Could not update level')
                                }
                              }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <span className="text-border">|</span>
                            <button
                              onClick={async () => {
                                const levelObj = levels.find(l => l.name === group.level) || group
                                if (!levelObj.id) return
                                const newStatus = group.status === 'archived' ? 'active' : 'archived'
                                try {
                                  const res = await fetch(`${API_BASE}/api/levels/${levelObj.id}`, {
                                    method: 'PATCH',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ status: newStatus }),
                                  })
                                  const d = await res.json()
                                  if (!res.ok) throw new Error(d.detail || d.error || 'Could not archive level')
                                  setLevels(prev => prev.map(l => l.id === levelObj.id ? { ...l, status: newStatus } : l))
                                } catch (err) {
                                  console.error('Archive level failed', err)
                                  window.alert(err instanceof Error ? err.message : 'Could not archive level')
                                }
                              }}
                              className="text-xs font-medium text-muted-foreground hover:text-foreground"
                            >
                              {group.status === 'archived' ? 'Unarchive' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── COURSES ── */}
          {tab === 'courses' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option>All Levels</option>
                    {levels.map(l => <option key={l.name}>{l.name}</option>)}
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option>All Status</option>
                    <option>Active</option>
                    <option>Archived</option>
                  </select>
                  {selectedCourseIds.length > 0 && (
                    <button
                      onClick={handleBulkArchiveCourses}
                      className="px-3.5 py-2 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
                    >
                      <span>Archive Selected ({selectedCourseIds.length})</span>
                    </button>
                  )}
                </div>
                <button onClick={() => openCourseModal()} className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-950 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add Course
                </button>
              </div>
              <div className="bg-card border border-border rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.length > 0 && selectedCourseIds.length === allCourses.length}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedCourseIds(allCourses.map(c => c.id || '').filter(Boolean))
                            } else {
                              setSelectedCourseIds([])
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary/30"
                        />
                      </th>
                      {['Code', 'Course Title', 'Level', 'Lecturer', 'Enrolled', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allCourses.filter(c => {
                      const matchesLevel = levelFilter === 'All Levels' || c.level === levelFilter
                      const matchesStatus = statusFilter === 'All Status' || c.status.toLowerCase() === statusFilter.toLowerCase()
                      const matchesSearch = !searchQuery || `${c.code} ${c.title} ${c.level} ${c.lecturer}`.toLowerCase().includes(searchQuery.toLowerCase())
                      return matchesLevel && matchesStatus && matchesSearch
                    }).map((c, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={selectedCourseIds.includes(c.id || '')}
                            onChange={e => {
                              if (!c.id) return
                              if (e.target.checked) {
                                setSelectedCourseIds(prev => [...prev, c.id!])
                              } else {
                                setSelectedCourseIds(prev => prev.filter(id => id !== c.id))
                              }
                            }}
                            className="rounded border-border text-primary focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-primary">{c.code}</td>
                        <td className="px-4 py-3.5 text-foreground font-medium max-w-48 truncate">{c.title}</td>
                        <td className="px-4 py-3.5"><span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">{c.level}</span></td>
                        <td className="px-4 py-3.5 text-muted-foreground text-xs">
                          {(() => {
                            // Split lecturer field by comma, filter to only registered names
                            const rawParts = (c.lecturer || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                            const registeredNames = rawParts.filter((name: string) =>
                              approvedLecturers.some(l => l.name.trim().toLowerCase() === name.toLowerCase())
                            )
                            if (registeredNames.length === 0) {
                              return (
                                <span className="flex items-center gap-1.5 text-muted-foreground/60 italic">
                                  <i className="fa-solid fa-circle-minus text-[10px]" />
                                  Unassigned
                                </span>
                              )
                            }
                            return (
                              <span className="flex items-center gap-1.5">
                                <i className="fa-solid fa-circle-check text-success text-[10px]" />
                                <span>{registeredNames.join(', ')}</span>
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-foreground font-mono font-semibold text-sm">
                          {c.enrolled > 0 ? (
                            <span className="flex items-center gap-1">
                              <i className="fa-solid fa-user-graduate text-primary text-[10px]" />
                              {c.enrolled}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-normal">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5"><Badge variant={c.status === 'Active' ? 'success' : 'default'}>{c.status}</Badge></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openCourseModal(c)} className="text-xs font-medium text-primary hover:underline">Edit</button>
                            <span className="text-border">|</span>
                            <button
                              onClick={() => openCourseModal({
                                code: `${c.code}-COPY`,
                                title: `${c.title} (Copy)`,
                                level: c.level,
                                lecturer: c.lecturer,
                                status: 'active'
                              })}
                              className="text-xs font-medium text-amber-600 hover:underline"
                              title="Duplicate course setup"
                            >
                              Duplicate
                            </button>
                            <span className="text-border">|</span>
                            <button
                              onClick={async () => {
                                if (!c.id) return
                                const newStatus = c.status === 'archived' ? 'active' : 'archived'
                                try {
                                  const res = await fetch(`${API_BASE}/api/courses/${c.id}`, {
                                    method: 'PATCH',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ status: newStatus }),
                                  })
                                  const d = await res.json()
                                  if (!res.ok) throw new Error(d.detail || d.error || 'Could not archive course')
                                  setAllCourses(prev => prev.map(item => item.id === c.id ? { ...item, status: newStatus } : item))
                                } catch (err) {
                                  console.error('Archive course failed', err)
                                  window.alert(err instanceof Error ? err.message : 'Could not archive course')
                                }
                              }}
                              className="text-xs font-medium text-muted-foreground hover:text-foreground"
                            >
                              {c.status === 'archived' ? 'Unarchive' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── LECTURERS ── */}
          {tab === 'lecturers' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex bg-muted rounded-xl p-1 w-fit">
                  {([['pending', `Pending (${visiblePending.length})`], ['approved', `Approved (${approvedLecturers.length})`]] as [string, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setLecturerSubTab(key as 'pending' | 'approved')} className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${lecturerSubTab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {lecturerSubTab === 'pending' && selectedLecturerIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBulkLecturers('active')}
                      className="px-3.5 py-1.5 bg-success text-success-foreground text-xs font-semibold rounded-xl transition-colors hover:bg-emerald-600 shadow-sm"
                    >
                      ✓ Approve Selected ({selectedLecturerIds.length})
                    </button>
                    <button
                      onClick={() => handleBulkLecturers('rejected')}
                      className="px-3.5 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold rounded-xl transition-colors"
                    >
                      ✗ Reject Selected ({selectedLecturerIds.length})
                    </button>
                  </div>
                )}
              </div>

              {lecturerSubTab === 'pending' && (
                <div className="bg-card border border-border rounded-2xl overflow-x-auto">
                  {visiblePending.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <p className="text-2xl mb-2"><Icon name="trophy" size={36} /></p>
                      <p className="font-semibold text-foreground">All approvals processed</p>
                      <p className="text-muted-foreground text-sm mt-1">No pending lecturer registrations.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-5 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={selectedLecturerIds.length > 0 && selectedLecturerIds.length === visiblePending.length}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedLecturerIds(visiblePending.map(l => l.id))
                                } else {
                                  setSelectedLecturerIds([])
                                }
                              }}
                              className="rounded border-border text-primary focus:ring-primary/30"
                            />
                          </th>
                          {['Name', 'Email', 'Department', 'Applied', 'Actions'].map(h => (
                            <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visiblePending.filter(l => !searchQuery || `${l.name} ${l.email} ${l.dept}`.toLowerCase().includes(searchQuery.toLowerCase())).map(l => (
                          <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-4">
                              <input
                                type="checkbox"
                                checked={selectedLecturerIds.includes(l.id)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedLecturerIds(prev => [...prev, l.id])
                                  } else {
                                    setSelectedLecturerIds(prev => prev.filter(id => id !== l.id))
                                  }
                                }}
                                className="rounded border-border text-primary focus:ring-primary/30"
                              />
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                                  <span className="text-primary text-xs font-bold">{l.name.charAt(0)}</span>
                                </div>
                                <span className="font-semibold text-foreground">{l.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{l.email}</td>
                            <td className="px-5 py-4 text-muted-foreground text-sm">{l.dept}</td>
                            <td className="px-5 py-4 text-muted-foreground text-xs">{l.applied}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setLecturerStatus(l.id, 'active')}
                                  disabled={actionLoadingLecturerIds.includes(l.id)}
                                  className="px-3 py-1.5 bg-success/10 hover:bg-success/20 text-success text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                                >
                                  {actionLoadingLecturerIds.includes(l.id) ? 'Approving...' : '✓ Approve'}
                                </button>
                                <button
                                  onClick={() => setLecturerStatus(l.id, 'rejected')}
                                  disabled={actionLoadingLecturerIds.includes(l.id)}
                                  className="px-3 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                                >
                                  {actionLoadingLecturerIds.includes(l.id) ? 'Rejecting...' : '✗ Reject'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {lecturerSubTab === 'approved' && (
                <div className="bg-card border border-border rounded-2xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Name', 'Email', 'Department', 'Status', 'Last Active', 'Actions'].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {approvedLecturers.map(l => (
                        <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-primary text-xs font-bold">{l.name.charAt(0)}</span>
                              </div>
                              <span className="font-semibold text-foreground">{l.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground text-xs">{l.email}</td>
                          <td className="px-5 py-4 text-muted-foreground text-sm">{l.dept}</td>
                          <td className="px-5 py-4">
                            {l.status === 'suspended' ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger bg-danger/10 px-2.5 py-1 rounded-full border border-danger/20">
                                <i className="fa-solid fa-user-slash text-[10px]" />
                                <span>Suspended</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20">
                                <i className="fa-solid fa-user-check text-[10px]" />
                                <span>Active</span>
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground text-xs">{l.lastActive}</td>
                          <td className="px-5 py-4">
                            {l.status === 'suspended' ? (
                              <button
                                onClick={() => setLecturerStatus(l.id, 'active')}
                                disabled={actionLoadingLecturerIds.includes(l.id)}
                                className="px-3.5 py-1.5 bg-success/15 hover:bg-success/25 text-success font-semibold text-xs rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5 shadow-xs"
                                title="Reinstate lecturer access"
                              >
                                <i className="fa-solid fa-rotate-left text-xs" />
                                <span>{actionLoadingLecturerIds.includes(l.id) ? 'Reinstating...' : 'Reinstate Lecturer'}</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to suspend ${l.name}? They will lose access to TMAS until reinstated.`)) {
                                    setLecturerStatus(l.id, 'suspended')
                                  }
                                }}
                                disabled={actionLoadingLecturerIds.includes(l.id)}
                                className="px-3.5 py-1.5 bg-danger/10 hover:bg-danger/20 text-danger font-semibold text-xs rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5"
                                title="Suspend lecturer access"
                              >
                                <i className="fa-solid fa-ban text-xs" />
                                <span>{actionLoadingLecturerIds.includes(l.id) ? 'Suspending...' : 'Suspend'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STUDENTS ── */}
          {tab === 'students' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">{students.length} student{students.length === 1 ? '' : 's'} registered.</p>
                <button
                  onClick={() => setCsvModalOpen(true)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-blue-950 transition-colors shadow-sm"
                >
                  <Icon name="upload" size={14} />
                  <span>Import Students (CSV)</span>
                </button>
              </div>
              {studentsGroupedByLevel.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
                  No students match your search.
                </div>
              ) : (
                studentsGroupedByLevel.map(([levelName, group]) => (
                  <div key={levelName} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-lg">{levelName}</span>
                      <span className="text-xs text-muted-foreground">{group.length} student{group.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            {['Student', 'Email', 'Courses Enrolled', 'Completion', 'Registered', 'Status'].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {group.map((s, i) => (
                            <tr key={s.id || i} className="hover:bg-muted/30 transition-colors">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <span className="text-muted-foreground text-xs font-bold">{s.name.charAt(0)}</span>
                                  </div>
                                  <span className="font-semibold text-foreground">{s.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-muted-foreground text-xs">{s.email}</td>
                              <td className="px-5 py-4 text-foreground font-mono font-semibold">{s.courses}</td>
                              <td className="px-5 py-4 w-36"><ProgressBar value={s.completion ?? 0} /></td>
                              <td className="px-5 py-4 text-muted-foreground text-xs">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                              <td className="px-5 py-4">
                                <select
                                  value={s.status || 'active'}
                                  onChange={async e => {
                                    const newStatus = e.target.value
                                    try {
                                      const res = await fetch(`${API_BASE}/api/dashboard/students/${s.id}`, {
                                        method: 'PATCH',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify({ status: newStatus }),
                                      })
                                      const d = await res.json()
                                      if (!res.ok) throw new Error(d.detail || d.error || 'Could not update student status')
                                      setStudents(prev => prev.map(st => st.id === s.id ? { ...st, status: d.student.status } : st))
                                    } catch (err) {
                                      console.error('Update student status failed', err)
                                      window.alert(err instanceof Error ? err.message : 'Could not update student status')
                                    }
                                  }}
                                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border focus:outline-none transition-colors ${
                                    s.status === 'active' ? 'bg-green-100 text-green-800 border-green-300' :
                                    s.status === 'suspended' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                    'bg-red-100 text-red-800 border-red-300'
                                  }`}
                                >
                                  <option value="active">Active</option>
                                  <option value="suspended">Suspended</option>
                                  <option value="revoked">Revoked</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {tab === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { label: 'Institution Avg Score', val: `${avgCourseScore}%`, trend: `${activeCourses} active courses`, color: 'text-blue-600', tint: 'bg-blue-500/10', icon: 'chart-line' },
                  { label: 'Inactive Students', val: String(inactiveStudents), trend: totalStudents ? `out of ${totalStudents}` : 'No students yet', color: 'text-danger', tint: 'bg-danger/10', icon: 'user-slash' },
                  { label: 'Quiz Completion', val: `${quizCompletionRate}%`, trend: quizTrend, color: 'text-success', tint: 'bg-success/10', icon: 'circle-check' },
                  { label: 'Materials Uploaded', val: String(materialsUploaded), trend: `${materialsCount} materials indexed`, color: 'text-purple-600', tint: 'bg-purple-500/10', icon: 'file-lines' },
                ].map((s, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                    <div className={`inline-flex p-2 rounded-xl mb-3 ${s.tint} ${s.color}`}>
                      <i className={`fa-solid fa-${s.icon}`} />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{s.label}</p>
                    <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">{s.trend}</p>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-semibold text-foreground mb-5">Completion Rate by Level</h3>
                  <div className="space-y-4">
                    {studentsByLevel.length > 0 ? studentsByLevel.map((l, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-foreground font-mono">{l.level}</span>
                          <span className="text-xs text-muted-foreground">{l.count} students · {l.percentage}%</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${l.percentage >= 80 ? 'bg-success' : l.percentage >= 50 ? 'bg-primary' : 'bg-amber-500'}`}
                            style={{ width: `${l.percentage}%` }}
                          />
                        </div>
                      </div>
                    )) : (
                      <div className="text-sm text-muted-foreground">No student level data available yet.</div>
                    )}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-semibold text-foreground mb-5">Top Performing Courses</h3>
                  <div className="space-y-3">
                    {topCourses.length > 0 ? topCourses.map((course, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <span className="text-primary font-mono text-xs font-bold w-14">{course.code}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-foreground truncate">{course.title}</span>
                            <span className="text-xs font-mono font-bold text-foreground ml-2">{course.avgScore}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${course.avgScore}%` }} />
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-sm text-muted-foreground">No course analytics available yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <CourseModal
        open={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        onSubmit={handleSaveCourse}
        initialCourse={selectedCourse ?? undefined}
        levels={levels.map(level => level.name)}
        lecturers={dashboardLecturers.filter(l => l.status === 'active').map(l => l.name)}
        courseCodes={Array.from(new Set(allCourses.map(c => c.code).filter(Boolean)))}
        courseTitles={Array.from(new Set(allCourses.map(c => c.title).filter(Boolean)))}
        saving={isSavingCourse}
        errorMessage={courseModalError}
      />

      {/* CSV Student Import Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCsvModalOpen(false)}>
          <div className="w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-foreground text-base">Bulk Student Import (CSV)</h3>
              <button onClick={() => setCsvModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste CSV records below (Format: <code>Full Name, Email, Level, Program</code>). One student per line:
            </p>
            <textarea
              rows={6}
              value={csvRawText}
              onChange={e => setCsvRawText(e.target.value)}
              placeholder="John Smith, john.smith@student.edu, Level 100, Computer Science&#10;Alice Brown, alice.brown@student.edu, Level 200, Software Engineering"
              className="w-full rounded-2xl border border-border bg-muted p-3 text-xs font-mono text-foreground outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setCsvModalOpen(false)} className="px-4 py-2 border border-border text-xs rounded-xl hover:bg-muted text-foreground">Cancel</button>
              <button
                onClick={handleImportCsvStudents}
                disabled={isImportingCsv || !csvRawText.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-blue-950 disabled:opacity-60 transition-colors"
              >
                {isImportingCsv ? 'Importing...' : 'Batch Import Students'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Announcement Modal */}
      {announcementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAnnouncementModalOpen(false)}>
          <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-foreground text-base">Broadcast Announcement</h3>
              <button onClick={() => setAnnouncementModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Target Audience</label>
              <select
                value={announcementTarget}
                onChange={e => setAnnouncementTarget(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-xs text-foreground outline-none"
              >
                <option>All Users</option>
                <option>All Lecturers</option>
                <option>All Students</option>
                <option>Level 100 Students</option>
                <option>Level 200 Students</option>
                <option>Level 300 Students</option>
                <option>Level 400 Students</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Announcement Message</label>
              <textarea
                rows={4}
                value={announcementMsg}
                onChange={e => setAnnouncementMsg(e.target.value)}
                placeholder="Type system alert or institutional announcement..."
                className="w-full rounded-2xl border border-border bg-muted p-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAnnouncementModalOpen(false)} className="px-4 py-2 border border-border text-xs rounded-xl hover:bg-muted text-foreground">Cancel</button>
              <button
                onClick={handleBroadcastAnnouncement}
                disabled={!announcementMsg.trim()}
                className="px-4 py-2 bg-accent text-accent-foreground text-xs font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-60 transition-colors"
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
