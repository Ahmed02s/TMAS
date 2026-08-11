// FastAPI's default handler for a Pydantic validation failure (e.g. EmailStr rejecting a
// malformed address, or a field_validator raising ValueError) returns `detail` as an ARRAY
// of error objects, not a string — but every hand-written HTTPException in this backend
// (login failed, quiz already attempted, etc.) returns `detail` as a plain string. Frontend
// code across this app did `data.detail || data.error || 'fallback'` and passed that
// straight into `new Error(...)`, which silently stringifies an array of objects to the
// literal text "[object Object]" — the exact case a user hits by typing an email address
// the client-side regex is too permissive to catch (e.g. "a@b..com") but the backend's
// stricter EmailStr correctly rejects. This normalizes both shapes into a readable string.
export function extractErrorMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail

  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail) && detail.length) {
    const messages = detail
      .map(item => (item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : String(item)))
      .filter(Boolean)
    if (messages.length) return messages.join(' ')
  }

  const error = (data as { error?: unknown } | null)?.error
  if (typeof error === 'string' && error.trim()) return error

  return fallback
}
