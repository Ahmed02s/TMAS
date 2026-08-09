import { API_BASE } from '../config'

// Backend routes now enforce real (signed, expiring) session tokens on sensitive actions,
// but the app's ~100+ existing `fetch(...)` call sites were all written before any of that
// existed and never attach an Authorization header. Rather than touching every call site
// (a large, error-prone change to this app's structure), this patches `window.fetch` once
// at startup so any request to our own API automatically carries the stored token — every
// existing call site keeps working unmodified.
let installed = false

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return (input as Request).url
}

// A 401 from these endpoints means "wrong credentials" / "not registered yet", not "your
// existing session expired" — don't treat it as a reason to blow away local auth state.
const AUTH_ENDPOINTS_EXEMPT_FROM_LOGOUT = ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password']

export function installAuthFetch(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = resolveRequestUrl(input)
    const isApiRequest = url.startsWith(API_BASE)

    let finalInit = init
    if (isApiRequest) {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tmas-token') : null
      if (token) {
        const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`)
        }
        finalInit = { ...init, headers }
      }
    }

    const response = await originalFetch(input, finalInit)

    if (isApiRequest && response.status === 401) {
      const path = url.slice(API_BASE.length)
      const isExempt = AUTH_ENDPOINTS_EXEMPT_FROM_LOGOUT.some(p => path.startsWith(p))
      if (!isExempt) {
        try {
          localStorage.removeItem('tmas-token')
          localStorage.removeItem('tmas-user')
        } catch {
          /* localStorage unavailable — nothing more to clean up */
        }
        window.dispatchEvent(new CustomEvent('tmas:unauthorized'))
      }
    }

    return response
  }
}
