// Mirrors passwordReset.ts's approach for detecting a link from an email, but keyed on a
// distinct `verify_token` param (not `token`) so a verification link and a password-reset
// link sitting in the same inbox can never be confused with each other.
export type EmailVerificationIntent = {
  open: boolean
  token: string
}

function hashQueryParams(): URLSearchParams {
  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  return new URLSearchParams(queryIndex === -1 ? '' : hash.slice(queryIndex + 1))
}

export function getEmailVerificationIntent(): EmailVerificationIntent {
  if (typeof window === 'undefined') {
    return { open: false, token: '' }
  }

  const token =
    new URLSearchParams(window.location.search).get('verify_token')?.trim() ||
    hashQueryParams().get('verify_token')?.trim() ||
    ''

  return token ? { open: true, token } : { open: false, token: '' }
}

// Removes the verification token from the visible URL once it's been captured into React
// state — same reasoning as clearPasswordResetUrl: no reason for a one-time token to linger
// in the address bar, browser history, or a screen share after the app has read it.
export function clearEmailVerificationUrl(): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return
  const url = new URL(window.location.href)
  let changed = false

  if (url.searchParams.has('verify_token')) {
    url.searchParams.delete('verify_token')
    changed = true
  }
  if (url.hash.includes('verify_token=')) {
    url.hash = ''
    changed = true
  }

  if (changed) {
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
}
