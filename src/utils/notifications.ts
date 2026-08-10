import { API_BASE } from '../config'

export interface AppNotification {
  id: string
  title: string
  message: string
  target_role?: string
  type?: 'info' | 'success' | 'warning' | 'danger' | 'system'
  read?: boolean
  created_at?: string
}

/**
 * Request permission for native browser push notifications
 */
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

/**
 * Trigger a native browser push notification popup on the user's OS/device
 * Includes fallback to ServiceWorker showNotification and In-App Banner Toast for mobile Safari/Chrome.
 */
export function triggerWebPushNotification(title: string, options?: { body?: string; icon?: string }) {
  if (typeof window === 'undefined') return

  // 1. In-app banner popup fallback for mobile browsers where native OS push may be restricted
  showInAppToast(title, options?.body)

  // 2. ServiceWorker notification (preferred for mobile Android/iOS PWAs)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready
      .then(reg => {
        reg.showNotification(title, {
          body: options?.body || '',
          icon: options?.icon || '/favicon.ico',
        })
      })
      .catch(() => {
        // Fallback to classic Notification object
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, {
              body: options?.body || '',
              icon: options?.icon || '/favicon.ico',
            })
          } catch (e) {
            console.warn('Native notification trigger warning:', e)
          }
        }
      })
    return
  }

  // 3. Classic Notification API for desktop browsers
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: options?.body || '',
        icon: options?.icon || '/favicon.ico',
      })
    } catch (e) {
      console.warn('Native notification trigger warning:', e)
    }
  }
}

/**
 * Display a subtle floating top toast on screen for mobile browsers
 */

export function showInAppToast(title: string, body?: string) {
  if (typeof document === 'undefined') return
  const toast = document.createElement('div')
  toast.className =
    'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md bg-slate-900/95 text-white backdrop-blur border border-amber-500/40 p-4 rounded-2xl shadow-2xl transition-all duration-300 flex items-start gap-3 animate-in fade-in slide-in-from-top-4'
  toast.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 text-lg">🔔</div>
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-xs sm:text-sm text-amber-300 truncate">${title}</p>
      ${body ? `<p class="text-xs text-slate-300 mt-0.5 line-clamp-2">${body}</p>` : ''}
    </div>
    <button class="text-slate-400 hover:text-white p-1 text-xs" onclick="this.parentElement.remove()">✕</button>
  `
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translate(-50%, -20px)'
    setTimeout(() => toast.remove(), 300)
  }, 4500)
}

/**
 * Play a subtle notification chime sound
 */
export function playNotificationChime() {
  if (typeof window === 'undefined') return
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5 note
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5 note
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Silent fail if audio context blocked by browser autoplay policy
  }
}

/**
 * Dispatch a new notification to the backend and trigger native push notification
 */
export async function dispatchPushNotification(
  payload: {
    title: string
    message: string
    target_role?: 'all' | 'student' | 'lecturer' | 'admin'
    user_id?: string
    type?: 'info' | 'success' | 'warning' | 'danger'
  },
  /** Explicit bearer token for the one call site (lecturer registration) that fires before
   * any session is stored in localStorage, so the global fetch-auth patch has nothing to
   * attach automatically. Every other caller is already inside an authenticated portal and
   * can omit this — the patch covers it. */
  authToken?: string,
) {
  // Trigger web push on current device if matching role
  triggerWebPushNotification(payload.title, { body: payload.message })
  playNotificationChime()

  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`
    await fetch(`${API_BASE}/api/notifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('Failed to dispatch notification to API:', err)
  }
}

/**
 * Fetch active notifications for the user's role
 */
export async function fetchUserNotifications(role: string, userId?: string): Promise<AppNotification[]> {
  try {
    const res = await fetch(`${API_BASE}/api/notifications?role=${role}${userId ? `&user_id=${userId}` : ''}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.notifications || []
  } catch {
    return []
  }
}
