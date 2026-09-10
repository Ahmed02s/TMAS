import { useEffect, useState } from 'react'
import { API_BASE } from '../config'

export type PlatformStats = {
  registered_students: number
  active_courses: number
  average_quiz_score: number | null
  institutions_represented: number
}

export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_BASE}/api/public/platform-stats`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Unable to load platform statistics')
        return response.json() as Promise<PlatformStats>
      })
      .then(setStats)
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStats(null)
      })

    return () => controller.abort()
  }, [])

  return stats
}

export function formatPlatformStat(value: number | null | undefined, suffix = '') {
  return value === null || value === undefined ? '—' : `${value.toLocaleString()}${suffix}`
}
