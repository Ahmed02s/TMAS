// Notifications have no per-user read-state in the backend (see backend/app/routers/
// notifications.py — `read` is one shared flag per row, not per-recipient), so "clearing" a
// notification can't be done by calling the mark-read API — that would hide it for every
// other user who's supposed to see the same broadcast. Dismissal is tracked client-side
// instead, scoped per logged-in user, so clearing your own bell never affects anyone else's.
const KEY_PREFIX = 'tmas-dismissed-notifs-'

export function getDismissedNotificationIds(userId: string | undefined | null): Set<string> {
  if (!userId || typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function dismissNotificationIds(userId: string | undefined | null, ids: string[]): Set<string> {
  const current = getDismissedNotificationIds(userId)
  if (!userId || typeof window === 'undefined') return current
  ids.forEach(id => current.add(id))
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify([...current]))
  } catch {
    /* localStorage unavailable — dismissal just won't persist across reloads */
  }
  return current
}
