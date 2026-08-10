// Single source of truth for detecting a password-reset link from the URL. Both App.tsx
// (deciding which top-level view to render) and Login.tsx (deciding whether to pop the
// reset modal open) call this instead of each re-implementing their own pathname parsing —
// previously they used two subtly different checks that could disagree.
export type PasswordResetIntent = {
  open: boolean
  step: 'request' | 'reset'
  token: string
}

const FORGOT_PATH_HINTS = ['forgot-password', 'reset-password']

function normalizedPath(): string {
  return window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '')
}

// The actual emailed reset link has been observed arriving as
// `https://<domain>/#/forgot-password?token=...` — a hash-fragment URL (likely a leftover
// FRONTEND_URL env var from an earlier hash-router setup on the backend; see
// backend/app/core/config.py). Everything after `#` is never sent to the server and is NOT
// part of `location.search`, so a token living there is invisible to a plain
// `URLSearchParams(location.search)` read. This app doesn't use hash routing at all, so any
// `?query` found inside the hash is just a plain query string that needs parsing on its own.
function hashQueryParams(): URLSearchParams {
  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  return new URLSearchParams(queryIndex === -1 ? '' : hash.slice(queryIndex + 1))
}

export function getPasswordResetIntent(): PasswordResetIntent {
  if (typeof window === 'undefined') {
    return { open: false, step: 'request', token: '' }
  }

  const token =
    new URLSearchParams(window.location.search).get('token')?.trim() ||
    hashQueryParams().get('token')?.trim() ||
    ''

  // A `token` param (query string or hash) is treated as authoritative regardless of
  // pathname. Static hosts don't reliably preserve a deep-linked path like
  // `/reset-password` without an explicit rewrite rule — a link can land on `/` (or on a
  // `/#/...` hash route) with the token still attached. Requiring an exact path match on
  // top of the token was the original bug: the email link worked (token arrived), but the
  // modal never opened because the path didn't match, so the app fell through to landing.
  if (token) {
    return { open: true, step: 'reset', token }
  }

  // No token: still recognize a bare forgot/reset-password link (path- or hash-based —
  // e.g. someone bookmarked or typed it) and open straight to the "request a reset" step.
  const path = normalizedPath()
  const hash = window.location.hash.toLowerCase()
  if (FORGOT_PATH_HINTS.some(hint => path.includes(hint) || hash.includes(hint))) {
    return { open: true, step: 'request', token: '' }
  }

  return { open: false, step: 'request', token: '' }
}

// Removes the reset token from the visible URL (query string or hash) once it's been
// captured into React state — a password-reset token sitting in the address bar is easy to
// accidentally share (browser history, screen share, a copied URL) and has no reason to
// stick around after the app has read it.
export function clearPasswordResetUrl(): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return
  const url = new URL(window.location.href)
  let changed = false

  if (url.searchParams.has('token')) {
    url.searchParams.delete('token')
    changed = true
  }
  if (url.hash.includes('token=')) {
    url.hash = ''
    changed = true
  }

  if (changed) {
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
}
