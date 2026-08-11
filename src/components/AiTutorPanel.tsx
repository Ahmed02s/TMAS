import { useState } from 'react'
import { API_BASE } from '../config'
import { extractErrorMessage } from '../utils/apiError'

type TutorAction = 'ask' | 'explain_page' | 'summarize' | 'practice'

type PracticeQuestion = {
  id: number
  type: string
  difficulty: string
  question: string
  options: string[]
  answer: string
  explanation: string
}

type TutorResponse = {
  success: boolean
  action: TutorAction
  answer: string
  source: { material_id: number; page: number | null } | null
  practice_questions?: PracticeQuestion[]
}

type AiTutorPanelProps = {
  materialId: number
  materialName: string
  course: string
  studentId?: string
  currentPage?: number
  isPdf: boolean
  onClose: () => void
}

const ACTIONS: { key: TutorAction; label: string; icon: string }[] = [
  { key: 'ask', label: 'Ask', icon: 'fa-comment-dots' },
  { key: 'explain_page', label: 'Explain this page', icon: 'fa-lightbulb' },
  { key: 'summarize', label: 'Summarize', icon: 'fa-align-left' },
  { key: 'practice', label: 'Practice questions', icon: 'fa-list-check' },
]

export default function AiTutorPanel({ materialId, materialName, studentId, currentPage, isPdf, onClose }: AiTutorPanelProps) {
  const [activeAction, setActiveAction] = useState<TutorAction | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TutorResponse | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

  async function runAction(action: TutorAction, questionText?: string) {
    if (!studentId) return
    setLoading(true)
    setError('')
    setResult(null)
    setRevealed(new Set())
    try {
      const res = await fetch(`${API_BASE}/api/materials/${materialId}/tutor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          action,
          question: questionText,
          current_page: isPdf ? currentPage : undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(extractErrorMessage(data, 'Something went wrong — please try again.'))
        return
      }
      setActiveAction(action)
      setResult(data)
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleActionClick(action: TutorAction) {
    if (action === 'ask') {
      setAskOpen(true)
      return
    }
    setAskOpen(false)
    runAction(action)
  }

  function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    runAction('ask', question.trim())
  }

  function toggleReveal(id: number) {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      className={
        'fixed inset-x-0 bottom-0 z-[70] flex h-[75vh] flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl ' +
        'sm:static sm:inset-auto sm:z-auto sm:h-full sm:w-96 sm:shrink-0 sm:rounded-3xl sm:border sm:shadow-none'
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <i className="fa-solid fa-robot text-sm" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">AI Tutor</p>
            <p className="truncate text-[11px] text-muted-foreground">{materialName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close AI Tutor"
        >
          <i className="fa-solid fa-xmark text-sm" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3 shrink-0">
        {ACTIONS.map(a => (
          <button
            key={a.key}
            onClick={() => handleActionClick(a.key)}
            disabled={loading}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
              activeAction === a.key || (a.key === 'ask' && askOpen)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <i className={`fa-solid ${a.icon} text-[11px]`} />
            <span className="truncate">{a.label}</span>
          </button>
        ))}
      </div>

      {askOpen && (
        <form onSubmit={handleAskSubmit} className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
          <input
            autoFocus
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask about this material…"
            className="flex-1 rounded-full border border-border bg-background px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            title="Send"
          >
            <i className="fa-solid fa-paper-plane text-xs" />
          </button>
        </form>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-xs text-muted-foreground">Thinking…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-xs text-danger">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            {error}
          </div>
        )}

        {!loading && !error && !result && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <i className="fa-solid fa-robot text-2xl text-muted-foreground/50" />
            <p>Ask a question, or use one of the actions above to get help with this material.</p>
          </div>
        )}

        {!loading && !error && result && result.action !== 'practice' && (
          <div className="space-y-3">
            <div className="whitespace-pre-wrap rounded-2xl border border-border bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-foreground">
              {result.answer}
            </div>
            {result.source?.page && (
              <p className="text-[11px] text-muted-foreground">
                <i className="fa-solid fa-file-lines mr-1" />
                Source: {materialName} — Page {result.source.page}
              </p>
            )}
          </div>
        )}

        {!loading && !error && result && result.action === 'practice' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{result.answer}</p>
            {(result.practice_questions || []).map((q, i) => (
              <div key={q.id ?? i} className="rounded-2xl border border-border bg-muted/20 p-3.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">AI Practice</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{q.type}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{q.question}</p>
                {q.options?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {q.options.map((opt, oi) => (
                      <li key={oi} className="rounded-lg bg-background px-2.5 py-1.5 text-xs text-foreground/90">
                        {String.fromCharCode(65 + oi)}. {opt}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => toggleReveal(q.id ?? i)}
                  className="mt-2 text-[11px] font-semibold text-primary hover:underline"
                >
                  {revealed.has(q.id ?? i) ? 'Hide answer' : 'Reveal answer'}
                </button>
                {revealed.has(q.id ?? i) && (
                  <div className="mt-2 rounded-lg bg-success/10 px-2.5 py-2 text-xs text-foreground">
                    <p className="font-semibold text-success">Answer: {q.answer}</p>
                    {q.explanation && <p className="mt-1 text-muted-foreground">{q.explanation}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
