// A large PDF/slide deck on a slow connection previously just showed an indeterminate
// spinner for however long the download took — indistinguishable from "broken." Reading the
// body as a stream (when the server reports Content-Length) gives real percentage feedback.
// Shared between MaterialViewer.tsx (all formats) and PdfReader.tsx so both report progress
// the same way instead of duplicating this.
export async function fetchWithProgress(url: string, onProgress: (pct: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) {
    // Surface the server's real reason (404 "not found on disk", 502 storage error, etc.)
    // instead of a single generic message that masks why a specific file is broken.
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.detail || ''
    } catch {
      /* response wasn't JSON — fall through to the generic message below */
    }
    throw new Error(detail || `Unable to download this material (server responded ${res.status})`)
  }

  const total = Number(res.headers.get('content-length') || 0)
  if (!total || !res.body) return res.arrayBuffer()

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(Math.min(100, Math.round((received / total) * 100)))
  }
  const combined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return combined.buffer
}
