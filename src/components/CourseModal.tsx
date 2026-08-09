import { useEffect, useState } from 'react'

const COURSE_CODE_REGEX = /^[A-Za-z]{4}\s*\d{3}$/

export type CourseFormValues = {
  id?: string
  code: string
  title: string
  level: string
  lecturer: string
  status: string
}

type CourseModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (course: CourseFormValues) => void
  initialCourse?: CourseFormValues
  levels: string[]
  lecturers: string[]
  courseCodes?: string[]
  courseTitles?: string[]
  saving?: boolean
  errorMessage?: string
}

export default function CourseModal({
  open,
  onClose,
  onSubmit,
  initialCourse,
  levels,
  lecturers,
  courseCodes = [],
  courseTitles = [],
  saving,
  errorMessage,
}: CourseModalProps) {
  const [form, setForm] = useState<CourseFormValues>({
    code: '',
    title: '',
    level: '',
    lecturer: '',
    status: 'active',
  })
  const [codeError, setCodeError] = useState('')
  const [titleError, setTitleError] = useState('')
  const [levelError, setLevelError] = useState('')

  const validateCourseCode = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return 'Course code is required.'
    }
    if (!COURSE_CODE_REGEX.test(trimmed)) {
      return 'Course code must be 4 letters followed by 3 digits, for example COMP 101.'
    }
    return ''
  }

  const validateTitle = (value: string) => (value.trim() ? '' : 'Course title is required.')
  const validateLevel = (value: string) => (levels.length && !value ? 'Select an academic level.' : '')

  useEffect(() => {
    if (!open) return
    setForm({
      code: initialCourse?.code ?? '',
      title: initialCourse?.title ?? '',
      level: initialCourse?.level ?? levels[0] ?? '',
      lecturer: initialCourse?.lecturer ?? '',
      status: initialCourse?.status ?? 'active',
      id: initialCourse?.id,
    })
    setCodeError('')
    setTitleError('')
    setLevelError('')
  }, [initialCourse, levels, open])

  if (!open) return null

  const title = initialCourse?.id ? 'Edit Course' : 'Create Course'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <p className="text-lg font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">Use this form to manage course details and visibility.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-foreground">
              <span>Course code</span>
              <input
                value={form.code}
                onChange={e => {
                  const value = e.target.value
                  setForm(prev => ({ ...prev, code: value }))
                  setCodeError(COURSE_CODE_REGEX.test(value.trim()) ? '' : 'Course code must be 4 letters followed by 3 digits, for example COMP 101.')
                }}
                placeholder="e.g. COMP 101"
                list="course-code-suggestions"
                className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              />
              <datalist id="course-code-suggestions">
                {(courseCodes || []).map(c => <option key={c} value={c} />)}
              </datalist>
              <span className="block text-xs text-muted-foreground">Type any code — the suggestions are just a shortcut, not a restriction.</span>
              {codeError ? <span className="text-xs text-danger">{codeError}</span> : null}
            </label>
            <label className="space-y-2 text-sm text-foreground">
              <span>Course title</span>
              <input
                value={form.title}
                onChange={e => {
                  const value = e.target.value
                  setForm(prev => ({ ...prev, title: value }))
                  setTitleError(validateTitle(value))
                }}
                placeholder="e.g. Programming with Python"
                list="course-title-suggestions"
                className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              />
              <datalist id="course-title-suggestions">
                {(courseTitles || []).map(t => <option key={t} value={t} />)}
              </datalist>
              <span className="block text-xs text-muted-foreground">Type any title — the suggestions are just a shortcut, not a restriction.</span>
              {titleError ? <span className="text-xs text-danger">{titleError}</span> : null}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-foreground">
              <span>Academic level</span>
              <select
                value={form.level}
                onChange={e => {
                  const value = e.target.value
                  setForm(prev => ({ ...prev, level: value }))
                  setLevelError(validateLevel(value))
                }}
                className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              >
                <option value="" disabled>{levels.length ? 'Select a level' : 'No levels available'}</option>
                {levels.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              {levelError ? <span className="block text-xs text-danger">{levelError}</span> : null}
            </label>

            <div className="space-y-2 text-sm text-foreground">
              <span>Assign Lecturer(s)</span>
              {lecturers.length > 0 ? (
                <div className="max-h-36 overflow-y-auto rounded-2xl border border-border bg-muted p-2.5 space-y-1.5">
                  {lecturers.map(l => {
                    const assignedList = form.lecturer ? form.lecturer.split(',').map(s => s.trim()) : []
                    const isChecked = assignedList.includes(l)
                    return (
                      <label key={l} className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-background/80 cursor-pointer text-xs font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            let updated: string[]
                            if (e.target.checked) {
                              updated = Array.from(new Set([...assignedList, l]))
                            } else {
                              updated = assignedList.filter(item => item !== l)
                            }
                            setForm(prev => ({ ...prev, lecturer: updated.join(', ') }))
                          }}
                          className="rounded border-border text-primary focus:ring-primary/30"
                        />
                        <span>{l}</span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <input
                  value={form.lecturer}
                  onChange={e => setForm(prev => ({ ...prev, lecturer: e.target.value }))}
                  placeholder="Professor Jane Doe"
                  className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>

          <label className="space-y-2 text-sm text-foreground">
            <span>Status</span>
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
              className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/50">
          <button onClick={onClose} className="rounded-2xl border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={() => {
              const cleanedCode = (form.code || '').trim()
              const cleanedTitle = (form.title || '').trim()
              const codeValidation = validateCourseCode(cleanedCode)
              const titleValidation = validateTitle(cleanedTitle)
              const levelValidation = validateLevel(form.level)
              setCodeError(codeValidation)
              setTitleError(titleValidation)
              setLevelError(levelValidation)
              if (codeValidation || titleValidation || levelValidation) {
                return
              }
              onSubmit({ ...form, code: cleanedCode, title: cleanedTitle })
            }}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-blue-950 disabled:opacity-60"
          >
            {saving ? 'Saving...' : initialCourse?.id ? 'Save changes' : 'Create course'}
          </button>
        </div>
      </div>
    </div>
  )
}
