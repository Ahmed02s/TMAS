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
 */
export function triggerWebPushNotification(title: string, options?: { body?: string; icon?: string }) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
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
export async function dispatchPushNotification(payload: {
  title: string
  message: string
  target_role?: 'all' | 'student' | 'lecturer' | 'admin'
  user_id?: string
  type?: 'info' | 'success' | 'warning' | 'danger'
}) {
  // Trigger web push on current device if matching role
  triggerWebPushNotification(payload.title, { body: payload.message })
  playNotificationChime()

  try {
    await fetch(`${API_BASE}/api/notifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
