'use client'
import { useEffect } from 'react'

const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Automatically logs out and redirects to / after 30 minutes of inactivity.
 * Resets on any mouse, keyboard, or touch event.
 */
export function useInactivityLogout() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const logout = () => {
      fetch('/api/auth/logout', { method: 'POST' })
        .finally(() => { window.location.href = '/' })
    }

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(logout, INACTIVITY_MS)
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset() // start timer on mount

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])
}
