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

export function getPasswordResetIntent(): PasswordResetIntent {
  if (typeof window === 'undefined') {
    return { open: false, step: 'request', token: '' }
  }

  const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? ''

  // A `token` query param is treated as authoritative regardless of pathname. Static hosts
  // (Vercel included) don't reliably preserve a deep-linked path like `/reset-password`
  // without an explicit rewrite rule — a link can land on `/` with the token still in the
  // query string. Requiring an exact path match on top of the token was the actual bug:
  // the email link worked (token arrived), but the modal never opened because the path
  // didn't match, so the app fell through to the landing page.
  if (token) {
    return { open: true, step: 'reset', token }
  }

  // No token: still recognize a bare `/forgot-password` link (e.g. someone bookmarked or
  // typed it) and open straight to the "request a reset" step.
  if (FORGOT_PATH_HINTS.some(hint => normalizedPath().includes(hint))) {
    return { open: true, step: 'request', token: '' }
  }

  return { open: false, step: 'request', token: '' }
}

// Removes `token` (and the forgot/reset path hint, if present) from the visible URL once
// it's been captured into React state — a password-reset token sitting in the address bar
// is easy to accidentally share (browser history, screen share, a copied URL) and has no
// reason to stick around after the app has read it.
export function clearPasswordResetUrl(): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('token')) return
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}
