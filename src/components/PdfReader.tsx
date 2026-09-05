import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { API_BASE } from '../config'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// PDF.js does not bundle its standard Type 1/TrueType font data into the worker. Without
// this URL, PDFs that rely on fonts such as Symbol or the base PDF fonts produce warnings
// and can render missing or substituted glyphs. These files are copied from
// pdfjs-dist/standard_fonts into public so they are served from the same origin as TMAS.
const standardFontDataUrl = new URL(
  `${import.meta.env.BASE_URL}pdfjs-standard-fonts/`,
  window.location.origin,
).toString()

type PdfReaderProps = {
  materialId: number
  arrayBuffer: ArrayBuffer
  studentId?: string
  // Page to jump to on open (from GET /api/materials/{id}/last-page) — omitted/undefined
  // or <= 1 just starts at the top like a first-time read.
  initialPage?: number
  onCompleted?: () => void
  // Notifies the parent of the page currently in view, purely so the AI Tutor panel knows
  // what the student is looking at — this is a read-only mirror of the currentPage state
  // already tracked below, not a second page tracker (PdfReader remains the one source of
  // truth for reading position/telemetry).
  onPageChange?: (page: number, numPages: number) => void
}

// Multipliers on top of the "fit container width" base scale computed at render time.
const ZOOM_STEPS = [0.6, 0.75, 1, 1.25, 1.5, 1.75, 2]
const DEFAULT_ZOOM_INDEX = 2 // 1x — matches the previous fixed-fit behavior

// A page must stay the most-visible one for this long before it's recorded as "read" —
// otherwise fast scrolling past a page on the way to another would still log it as read.
const PAGE_DWELL_MS = 1500

export default function PdfReader({ materialId, arrayBuffer, studentId, initialPage, onCompleted, onPageChange }: PdfReaderProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const [pageInput, setPageInput] = useState('1')
  const [renderError, setRenderError] = useState('')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  const jumpedToInitialRef = useRef(false)

  // ── Telemetry state (mirrors MaterialViewer's scroll/time model, but page-based) ──
  const maxPageReachedRef = useRef(1)
  const activeSecondsRef = useRef(0)
  const readPagesRef = useRef<Set<number>>(new Set())
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completedRef = useRef(false)
  const progressSyncInFlightRef = useRef(false)
  const onCompletedRef = useRef(onCompleted)

  useEffect(() => {
    onCompletedRef.current = onCompleted
  }, [onCompleted])

  // Load the PDF document once from the already-downloaded bytes (MaterialViewer owns the
  // network fetch + its own loading/error states — this component only renders).
  useEffect(() => {
    let cancelled = false
    setRenderError('')
    pdfjsLib.getDocument({
      data: arrayBuffer.slice(0),
      standardFontDataUrl,
    }).promise.then(doc => {
      if (cancelled) return
      setPdfDoc(doc)
      setNumPages(doc.numPages)
    }).catch(err => {
      if (!cancelled) setRenderError(err instanceof Error ? err.message : 'Failed to load PDF')
    })
    return () => {
      cancelled = true
    }
  }, [arrayBuffer])

  // Re-render every page's canvas when zoom changes, the document loads, or the viewport
  // is resized (orientation change / entering-exiting Focus Mode both resize the container,
  // which should re-fit the page width rather than leaving it sized for the old layout).
  const [resizeTick, setResizeTick] = useState(0)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    function handleResize() {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => setResizeTick(t => t + 1), 200)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false

    async function renderAll() {
      const containerWidth = containerRef.current?.clientWidth || 800
      const fitScale = Math.min(2.5, Math.max(0.5, (containerWidth - 32) / 800))
      const scale = fitScale * ZOOM_STEPS[zoomIndex]

      for (let pageNum = 1; pageNum <= pdfDoc!.numPages; pageNum++) {
        if (cancelled) return
        const canvas = canvasRefs.current[pageNum - 1]
        if (!canvas) continue
        const page = await pdfDoc!.getPage(pageNum)
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
      }
    }

    renderAll().catch(err => {
      if (!cancelled) setRenderError(err instanceof Error ? err.message : 'Failed to render PDF pages')
    })
    return () => {
      cancelled = true
    }
  }, [pdfDoc, zoomIndex, resizeTick])

  // Resume: jump straight to the student's last-read page instead of starting over at 1.
  useEffect(() => {
    if (jumpedToInitialRef.current || !numPages || !initialPage || initialPage <= 1) return
    const target = Math.min(initialPage, numPages)
    const el = pageRefs.current[target - 1]
    if (el) {
      jumpedToInitialRef.current = true
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
      setCurrentPage(target)
      setPageInput(String(target))
      maxPageReachedRef.current = target
    }
  }, [numPages, initialPage])

  // Whichever page occupies the most of the scroll container is "current" — drives the
  // page indicator, the page-jump input, and both telemetry signals below.
  useEffect(() => {
    if (!numPages || !containerRef.current) return
    const observer = new IntersectionObserver(
      entries => {
        let best: { page: number; ratio: number } | null = null
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page)
          if (!page || entry.intersectionRatio <= 0) continue
          if (!best || entry.intersectionRatio > best.ratio) best = { page, ratio: entry.intersectionRatio }
        }
        if (best) {
          setCurrentPage(best.page)
          setPageInput(String(best.page))
          if (best.page > maxPageReachedRef.current) maxPageReachedRef.current = best.page
        }
      },
      { root: containerRef.current, threshold: [0.25, 0.5, 0.75] },
    )
    pageRefs.current.slice(0, numPages).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [numPages])

  // Record a granular page-read once the current page has held focus for the dwell period.
  useEffect(() => {
    if (!studentId || readPagesRef.current.has(currentPage)) return
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)
    dwellTimerRef.current = setTimeout(() => {
      readPagesRef.current.add(currentPage)
      fetch(`${API_BASE}/api/materials/${materialId}/page-read`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, page_number: currentPage, total_pages: numPages }),
      }).catch(() => {})
    }, PAGE_DWELL_MS)
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)
    }
  }, [currentPage, studentId, materialId, numPages])

  // Periodic + final sync into the SAME /progress endpoint MaterialViewer's other formats
  // use, so the existing completion formula (scroll_percent + time thresholds) and the
  // lecturer-facing reading-progress views keep working unmodified — only the source of
  // scroll_percent changes, from DOM scroll depth to "furthest page reached / total pages".
  const syncProgress = useCallback((final: boolean) => {
    if (!studentId || !numPages) return
    const delta = activeSecondsRef.current
    if (delta <= 0 || (!final && progressSyncInFlightRef.current)) return
    activeSecondsRef.current = 0
    const scrollPercent = Math.min(100, Math.round((maxPageReachedRef.current / numPages) * 100))
    const payload = JSON.stringify({ student_id: studentId, scroll_percent: scrollPercent, time_spent_delta: delta })
    const url = `${API_BASE}/api/materials/${materialId}/progress`
    if (final) {
      let queued = false
      try {
        queued = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
      } catch {}
      if (!queued) {
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
      }
      return
    }
    progressSyncInFlightRef.current = true
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.completed && !completedRef.current) {
          completedRef.current = true
          onCompletedRef.current?.()
        }
      })
      .catch(() => {})
      .finally(() => {
        progressSyncInFlightRef.current = false
      })
  }, [materialId, studentId, numPages])

  useEffect(() => {
    if (!studentId) return
    const activeTick = setInterval(() => {
      if (document.visibilityState === 'visible') activeSecondsRef.current += 1
    }, 1000)
    const syncTick = setInterval(() => syncProgress(false), 10000)
    return () => {
      clearInterval(activeTick)
      clearInterval(syncTick)
      syncProgress(true)
    }
  }, [studentId, syncProgress])

  useEffect(() => {
    if (numPages) onPageChange?.(currentPage, numPages)
  }, [currentPage, numPages, onPageChange])

  const goToPage = useCallback((page: number) => {
    const target = Math.max(1, Math.min(numPages || 1, page))
    pageRefs.current[target - 1]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [numPages])

  const zoomPct = Math.round(ZOOM_STEPS[zoomIndex] * 100)

  return (
    <div className="h-full flex flex-col">
      {/* Compact toolbar — page navigation + zoom. Wraps on narrow screens. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            title="Previous page"
          >
            <i className="fa-solid fa-chevron-left text-xs" />
          </button>
          <form
            onSubmit={e => {
              e.preventDefault()
              const n = parseInt(pageInput, 10)
              if (!isNaN(n)) goToPage(n)
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <input
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onBlur={() => setPageInput(String(currentPage))}
              inputMode="numeric"
              className="w-10 px-1.5 py-1 text-center bg-background border border-border rounded-lg text-xs font-mono"
            />
            <span>of {numPages || '—'}</span>
          </form>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={!numPages || currentPage >= numPages}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            title="Next page"
          >
            <i className="fa-solid fa-chevron-right text-xs" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            title="Zoom out"
          >
            <i className="fa-solid fa-magnifying-glass-minus text-xs" />
          </button>
          <span className="w-12 text-center text-xs font-mono font-semibold text-muted-foreground">{zoomPct}%</span>
          <button
            onClick={() => setZoomIndex(i => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            title="Zoom in"
          >
            <i className="fa-solid fa-magnifying-glass-plus text-xs" />
          </button>
        </div>
      </div>

      {renderError && (
        <div className="p-4 text-center text-sm text-danger shrink-0">
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          {renderError}
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto bg-muted/20">
        <div className="flex flex-col items-center gap-4 p-4 sm:p-6">
          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
            <div
              key={pageNum}
              data-page={pageNum}
              ref={el => {
                pageRefs.current[pageNum - 1] = el
              }}
              className="relative"
            >
              <canvas
                ref={el => {
                  canvasRefs.current[pageNum - 1] = el
                }}
                className="block max-w-full rounded-lg shadow-[0_1px_8px_rgba(15,23,42,0.15)]"
              />
              <span className="absolute -top-2.5 left-2 text-[10px] font-mono font-bold text-muted-foreground bg-card border border-border px-1.5 py-0.5 rounded-full">
                {pageNum}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
