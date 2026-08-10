import { useEffect, useRef, useState, useCallback } from 'react'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import DOMPurify from 'dompurify'
import { API_BASE } from '../config'
import { fetchWithProgress } from '../utils/materialDownload'
import PdfReader from './PdfReader'

type FontSize = 'text-sm' | 'text-base' | 'text-lg' | 'text-xl'

type MaterialViewerProps = {
  materialId: number
  materialName: string
  downloadUrl: string
  // Set when materialName is a .pptx/.ppt that was converted to PDF at upload time (see
  // backend/app/services/office_convert.py). When present, this material is read as a PDF
  // via PdfReader instead of the client-side JSZip approximation — downloadUrl still points
  // at the true original file for the "Download Original" link, unaffected.
  pdfViewUrl?: string
  studentId?: string
  fontSize: FontSize
  onCompleted?: () => void
}

type PptxSlide = { title?: string; bullets: string[]; images: string[] }

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
}
// Skip anything absurd (a single corrupt/huge embedded asset shouldn't stall the whole deck).
const MAX_SLIDE_IMAGE_BYTES = 8 * 1024 * 1024

function getExtension(name: string): string {
  return (name.split('.').pop() || '').toLowerCase()
}

// mammoth (.docx) and JSZip (.pptx) only understand the modern zip/XML-based Office formats.
// A genuine legacy .doc/.ppt (pre-2007 OLE binary format) isn't a zip file at all, so handing
// one to either library throws immediately — the student just saw a broken/error state with
// no useful explanation. Detecting the real format from its magic bytes (rather than trusting
// the extension, since a modern .docx is sometimes saved with a .doc extension by mistake and
// should still render normally) lets legacy files fall back to a server-extracted plain-text
// preview instead of failing outright.
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function isLegacyOleFormat(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf.slice(0, 8))
  return OLE_MAGIC.every((b, i) => bytes[i] === b)
}

// Resolves a zip-relative path like "../media/image1.png" against "ppt/slides" without
// relying on the URL API's relative-resolution (some browsers reject constructing a URL
// with a fake/custom base scheme, which is more trouble than just doing this by hand).
function resolveZipRelativePath(baseDir: string, relativeTarget: string): string {
  const stack = baseDir.split('/').filter(Boolean)
  for (const part of relativeTarget.split('/').filter(Boolean)) {
    if (part === '..') stack.pop()
    else if (part !== '.') stack.push(part)
  }
  return stack.join('/')
}

// A slide's images are referenced indirectly: the slide XML has <a:blip r:embed="rIdN"/>
// inside each picture shape, and that rId only resolves to an actual file (ppt/media/imageX.*)
// via the slide's own relationship file. Two lookups per slide, not one.
async function extractSlideImages(
  zip: JSZip,
  slideFilename: string,
  slideDoc: Document,
): Promise<string[]> {
  const slideBase = slideFilename.split('/').pop() || ''
  const relsPath = `ppt/slides/_rels/${slideBase}.rels`
  const relsEntry = zip.files[relsPath]
  if (!relsEntry) return []

  const relsXml = await relsEntry.async('text')
  const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml')
  const relMap = new Map<string, string>()
  for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (id && target) {
      // Targets are relative to ppt/slides/ (e.g. "../media/image1.png").
      relMap.set(id, resolveZipRelativePath('ppt/slides', target))
    }
  }

  const blips = Array.from(slideDoc.getElementsByTagNameNS('*', 'blip'))
  const images: string[] = []
  for (const blip of blips) {
    const embedId =
      blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
      blip.getAttribute('r:embed')
    if (!embedId) continue
    const mediaPath = relMap.get(embedId)
    if (!mediaPath) continue
    const mediaEntry = zip.files[mediaPath]
    if (!mediaEntry) continue

    const ext = (mediaPath.split('.').pop() || '').toLowerCase()
    const mime = IMAGE_EXT_TO_MIME[ext]
    if (!mime) continue // unsupported (e.g. .emf/.wmf without a browser-native decoder)

    try {
      const base64 = await mediaEntry.async('base64')
      if (base64.length * 0.75 > MAX_SLIDE_IMAGE_BYTES) continue
      images.push(`data:${mime};base64,${base64}`)
    } catch {
      // Skip a corrupt individual image rather than failing the whole slide deck.
    }
  }
  return images
}

// ── PPTX: parse the raw zip/XML structure (no rendering library exists that both
// handles real PPTX layout AND runs fully client-side) — extract each slide's title,
// body text, and embedded images via the DOM's own XML parser, then render as styled
// slide cards. This doesn't reproduce exact PowerPoint layout/positioning, but nothing
// is silently dropped anymore — text AND images both show up. ──
async function parsePptx(arrayBuffer: ArrayBuffer): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      return na - nb
    })

  const parser = new DOMParser()
  const slides: PptxSlide[] = []

  for (const filename of slideFiles) {
    const xmlText = await zip.files[filename].async('text')
    const doc = parser.parseFromString(xmlText, 'application/xml')
    const shapes = Array.from(doc.getElementsByTagNameNS('*', 'sp'))
    let title = ''
    const bullets: string[] = []

    for (const shape of shapes) {
      const phEl = shape.getElementsByTagNameNS('*', 'ph')[0]
      const phType = phEl?.getAttribute('type') || ''
      const isTitle = phType.includes('title')
      const paragraphs = Array.from(shape.getElementsByTagNameNS('*', 'p'))

      for (const p of paragraphs) {
        const textNodes = Array.from(p.getElementsByTagNameNS('*', 't'))
        const text = textNodes.map(t => t.textContent || '').join('').trim()
        if (!text) continue
        if (isTitle && !title) {
          title = text
        } else {
          bullets.push(text)
        }
      }
    }

    const images = await extractSlideImages(zip, filename, doc)
    slides.push({ title: title || undefined, bullets, images })
  }

  return slides
}

function PptxSlides({ slides }: { slides: PptxSlide[] }) {
  if (slides.length === 0) {
    return <p className="text-sm text-muted-foreground p-6">No readable text found in this slide deck.</p>
  }
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {slides.map((slide, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card shadow-sm p-5 sm:p-6" style={{ minHeight: '180px' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Slide {i + 1}</span>
          </div>
          {slide.title && <h3 className="text-lg sm:text-xl font-bold text-foreground mb-3">{slide.title}</h3>}
          {slide.bullets.length > 0 && (
            <ul className="space-y-1.5 list-disc list-inside text-sm text-foreground/90 mb-4">
              {slide.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
            </ul>
          )}
          {slide.images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {slide.images.map((src, ii) => (
                <img
                  key={ii}
                  src={src}
                  alt={`Slide ${i + 1} image ${ii + 1}`}
                  className="max-w-full sm:max-w-xs rounded-lg border border-border shadow-sm"
                  loading="lazy"
                />
              ))}
            </div>
          )}
          {slide.bullets.length === 0 && slide.images.length === 0 && !slide.title && (
            <p className="text-xs text-muted-foreground italic">No readable content on this slide.</p>
          )}
        </div>
      ))}
    </div>
  )
}

// A legacy-format file the browser truly can't render — server-side extraction (which uses
// the same Python libraries as quiz generation) is tried first since it sometimes succeeds
// where mammoth/JSZip can't, but for a genuine old binary .doc/.ppt it typically can't
// extract anything meaningful either, in which case it returns this fixed placeholder.
const SERVER_EXTRACTION_PLACEHOLDER_PREFIX = 'Material: '

export default function MaterialViewer({ materialId, materialName, downloadUrl, pdfViewUrl, studentId, fontSize, onCompleted }: MaterialViewerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'legacy-unsupported'>('loading')
  const [downloadPct, setDownloadPct] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [docxHtml, setDocxHtml] = useState('')
  const [pptxSlides, setPptxSlides] = useState<PptxSlide[] | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null)
  const [pdfResumePage, setPdfResumePage] = useState<number | undefined>(undefined)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const ext = getExtension(materialName)
  // A converted PPTX (pdfViewUrl set) is read as a PDF even though its real extension isn't.
  const isPdf = ext === 'pdf' || Boolean(pdfViewUrl)
  const fetchUrl = pdfViewUrl || downloadUrl

  // ── Load + parse the raw file client-side ──
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setDownloadPct(null)
    setErrorMsg('')
    setDocxHtml('')
    setPptxSlides(null)
    setTextContent(null)
    setPdfBuffer(null)
    setPdfResumePage(undefined)

    async function tryServerExtractedText(): Promise<boolean> {
      try {
        const res = await fetch(`${API_BASE}/api/materials/${materialId}/content`)
        if (!res.ok) return false
        const data = await res.json()
        const content = String(data?.content || '')
        if (!content || content.startsWith(SERVER_EXTRACTION_PLACEHOLDER_PREFIX)) return false
        if (cancelled) return true
        setTextContent(content)
        setStatus('ready')
        return true
      } catch {
        return false
      }
    }

    async function load() {
      try {
        const buf = await fetchWithProgress(fetchUrl, pct => {
          if (!cancelled) setDownloadPct(pct)
        })
        if (cancelled) return
        setDownloadPct(null)

        if (isPdf) {
          // Best-effort resume lookup — a failure here just means the reader opens at
          // page 1, same as before this feature existed, rather than blocking the PDF.
          if (studentId) {
            try {
              const res = await fetch(`${API_BASE}/api/materials/${materialId}/last-page?student_id=${encodeURIComponent(studentId)}`)
              if (res.ok) {
                const data = await res.json()
                if (!cancelled && data?.last_page > 1) setPdfResumePage(data.last_page)
              }
            } catch {
              /* resume is a nicety, not a requirement */
            }
          }
          if (cancelled) return
          setPdfBuffer(buf)
          setStatus('ready')
        } else if (ext === 'docx' || ext === 'doc') {
          if (isLegacyOleFormat(buf)) {
            // Genuine legacy binary .doc — mammoth can only parse the modern zip/XML .docx
            // format and would just throw. Try the server's plain-text extraction instead of
            // failing outright; if that also comes up empty, say so plainly rather than
            // showing a raw/confusing error.
            if (!(await tryServerExtractedText()) && !cancelled) setStatus('legacy-unsupported')
            return
          }
          const result = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (cancelled) return
          setDocxHtml(DOMPurify.sanitize(result.value))
          setStatus('ready')
        } else if (ext === 'pptx' || ext === 'ppt') {
          if (isLegacyOleFormat(buf)) {
            // Genuine legacy binary .ppt — JSZip can't unzip a non-zip OLE file.
            if (!(await tryServerExtractedText()) && !cancelled) setStatus('legacy-unsupported')
            return
          }
          const slides = await parsePptx(buf)
          if (cancelled) return
          setPptxSlides(slides)
          setStatus('ready')
        } else {
          // txt/md/anything else: plain text
          const text = new TextDecoder('utf-8').decode(buf)
          if (cancelled) return
          setTextContent(text)
          setStatus('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to render this material')
          setStatus('error')
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [materialId, fetchUrl, ext, isPdf])

  // ── Scroll-depth + time-on-page telemetry (non-PDF formats only — PdfReader owns its own
  // page-based equivalent of this, since a page position is a more meaningful progress
  // signal than DOM scroll depth for a paginated document) ──
  const scrollPercentRef = useRef(0)
  const activeSecondsRef = useRef(0)
  const completedRef = useRef(false)

  const syncProgress = useCallback((final: boolean) => {
    if (!studentId || isPdf) return
    const delta = activeSecondsRef.current
    if (delta <= 0 && !final) return
    activeSecondsRef.current = 0
    const payload = JSON.stringify({
      student_id: studentId,
      scroll_percent: scrollPercentRef.current,
      time_spent_delta: delta,
    })
    const url = `${API_BASE}/api/materials/${materialId}/progress`
    if (final) {
      try {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
      } catch {
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
      }
      return
    }
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.completed && !completedRef.current) {
          completedRef.current = true
          onCompleted?.()
        }
      })
      .catch(() => {})
  }, [materialId, studentId, onCompleted])

  useEffect(() => {
    scrollPercentRef.current = 0
    activeSecondsRef.current = 0
    completedRef.current = false
  }, [materialId])

  useEffect(() => {
    if (!studentId || isPdf) return
    const activeTick = setInterval(() => {
      if (document.visibilityState === 'visible') {
        activeSecondsRef.current += 1
      }
    }, 1000)
    const syncTick = setInterval(() => syncProgress(false), 10000)
    return () => {
      clearInterval(activeTick)
      clearInterval(syncTick)
      syncProgress(true)
    }
  }, [materialId, studentId, syncProgress, isPdf])

  const handleScroll = useCallback(() => {
    if (isPdf) return
    const el = scrollContainerRef.current
    if (!el) return
    const pct = el.scrollHeight > el.clientHeight
      ? Math.min(100, Math.round(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100))
      : 100
    if (pct > scrollPercentRef.current) scrollPercentRef.current = pct
  }, [isPdf])

  // Content shorter than the viewport (no scrollbar at all) still counts as fully seen.
  useEffect(() => {
    if (status !== 'ready' || isPdf) return
    const id = requestAnimationFrame(() => {
      const el = scrollContainerRef.current
      if (el && el.scrollHeight <= el.clientHeight + 4) {
        scrollPercentRef.current = 100
      }
    })
    return () => cancelAnimationFrame(id)
  }, [status, docxHtml, pptxSlides, textContent, isPdf])

  // PdfReader manages its own internal scroll container and telemetry, so it can't sit
  // inside another `overflow-y-auto` region without nested/competing scrollbars.
  const wrapperClassName = isPdf && status === 'ready' ? 'h-full' : 'h-full overflow-y-auto'

  return (
    <div ref={scrollContainerRef} onScroll={handleScroll} className={wrapperClassName}>
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          {downloadPct !== null && (
            <div className="flex flex-col items-center gap-1.5 w-40">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${downloadPct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground font-mono">{downloadPct}%</span>
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="p-8 text-center text-sm text-danger">
          <i className="fa-solid fa-triangle-exclamation mb-2 block text-xl" />
          {errorMsg || 'Unable to render this material. Try downloading the original file.'}
        </div>
      )}

      {status === 'legacy-unsupported' && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          <i className="fa-solid fa-file-circle-exclamation mb-2 block text-xl text-amber-500" />
          This file is an older {ext === 'doc' ? 'Word (.doc)' : 'PowerPoint (.ppt)'} format that can't be
          previewed in the browser. Use the Download button to view it in{' '}
          {ext === 'doc' ? 'Word' : 'PowerPoint'}.
        </div>
      )}

      {status === 'ready' && isPdf && pdfBuffer && (
        <PdfReader
          materialId={materialId}
          arrayBuffer={pdfBuffer}
          studentId={studentId}
          initialPage={pdfResumePage}
          onCompleted={onCompleted}
        />
      )}

      {status === 'ready' && (ext === 'docx' || ext === 'doc') && (
        <div
          className={`prose prose-sm sm:prose-base max-w-none p-4 sm:p-6 sm:mx-auto sm:max-w-3xl ${fontSize} leading-relaxed text-foreground`}
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      )}

      {status === 'ready' && (ext === 'pptx' || ext === 'ppt') && pptxSlides && (
        <PptxSlides slides={pptxSlides} />
      )}

      {status === 'ready' && textContent !== null && (
        <pre className={`${fontSize} leading-relaxed text-foreground whitespace-pre-wrap p-4 sm:p-6 font-sans`}>
          {textContent}
        </pre>
      )}
    </div>
  )
}
