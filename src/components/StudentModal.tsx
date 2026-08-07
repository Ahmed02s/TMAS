import { useEffect, useState } from 'react'

export type StudentFormValues = {
  id: string
  name: string
  email: string
  level: string
  status: string
}

type StudentModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (student: StudentFormValues) => void
  initialStudent?: StudentFormValues
  levels: string[]
  saving?: boolean
  errorMessage?: string
}

export default function StudentModal({
  open,
  onClose,
  onSubmit,
  initialStudent,
  levels,
  saving,
  errorMessage,
}: StudentModalProps) {
  const [form, setForm] = useState<StudentFormValues>({
    id: '',
    name: '',
    email: '',
    level: '',
    status: 'active',
  })

  useEffect(() => {
    if (!open) return
    setForm({
      id: initialStudent?.id ?? '',
      name: initialStudent?.name ?? '',
      email: initialStudent?.email ?? '',
      level: initialStudent?.level ?? levels[0] ?? '',
      status: initialStudent?.status ?? 'active',
    })
  }, [initialStudent, levels, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <p className="text-lg font-semibold text-foreground">Update Student</p>
            <p className="text-sm text-muted-foreground">Assign the student's academic level and status using registration-level options.</p>
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
            <div className="space-y-2 text-sm text-foreground">
              <span>Name</span>
              <input value={form.name} readOnly className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none" />
            </div>
            <div className="space-y-2 text-sm text-foreground">
              <span>Email</span>
              <input value={form.email} readOnly className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-foreground">
              <span>Academic Level</span>
              <select
                value={form.level}
                onChange={e => setForm(prev => ({ ...prev, level: e.target.value }))}
                className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              >
                <option value="" disabled>{levels.length ? 'Select level' : 'No levels available'}</option>
                {levels.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-foreground">
              <span>Status</span>
              <select
                value={form.status}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="revoked">Revoked</option>
              </select>
            </label>
          </div>

          {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/50">
          <button onClick={onClose} className="rounded-2xl border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-blue-950 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
