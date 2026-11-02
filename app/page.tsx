'use client'
import { useState, useEffect } from 'react'
import { Pilot } from '@/lib/types'
import { GlassPanel, GlassButton, StatusDot } from '@/components/magav'
import { ThemeToggle } from '@/components/ThemeProvider'

/* ─────────────────────────────────────────────────────────────────────────
 *  Login — Night Ops Glass redesign
 *  All state, handlers, API calls, and auth logic are IDENTICAL to the
 *  previous version. Only presentation markup was replaced.
 * ───────────────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pilots, setPilots] = useState<Pilot[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(false)

  useEffect(() => {
    fetch('/api/pilots')
      .then(r => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPilots(data)
        } else {
          console.error('Failed to load pilots:', data)
          setApiError(true)
        }
        setLoading(false)
      })
      .catch(() => { setApiError(true); setLoading(false) })
  }, [])

  const handleLogin = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('נא להזין שם'); return }
    if (!password) { setError('נא להזין סיסמה'); return }
    if (apiError || !Array.isArray(pilots) || !pilots.some(p => p.name === trimmed)) {
      setError('שם לא מזוהה במערכת. פנה למפקד היחידה.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, password }),
      })
      let data: { ok?: boolean; isAdmin?: boolean; isViewer?: boolean; error?: string } = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (!res.ok) {
        if (data.error === 'rate_limited') {
          setError('יותר מדי ניסיונות — נסה שוב בעוד 15 דקות')
        } else if (data.error === 'invalid_credentials') {
          setError('שם משתמש או סיסמה שגויים')
        } else {
          setError(`שגיאת שרת (${res.status})`)
        }
        return
      }
      const dest = (data.isAdmin || data.isViewer) ? '/admin' : '/pilot'
      window.location.href = dest
    } catch {
      setError('שגיאת רשת — בדוק חיבור לאינטרנט ונסה שוב')
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = loading || submitting

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Floating theme toggle — top-left (RTL = top-right visually) */}
      <div className="fixed top-4 left-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[440px] enter-up">
        {/* ─── Identity header ─────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-5">
            {/* Emerald halo behind the logo — subtle "powered on" cue */}
            <span
              aria-hidden
              className="absolute inset-0 -m-8 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(46,229,157,0.12), transparent 70%)' }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="לוגו יחידה" className="relative w-40 h-40 object-contain" />
          </div>
          <div className="label-micro mb-2">יחידת רחפנים · מסווג</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">מערכת ניהול טיסות</h1>

          {/* Live-system chip */}
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border"
               style={{
                 borderColor: 'rgba(46,229,157,0.28)',
                 background: 'rgba(46,229,157,0.08)',
                 color: 'rgb(var(--emerald))',
                 fontSize: '12px',
                 fontWeight: 600,
                 letterSpacing: '0.04em',
               }}>
            <StatusDot tone="ok" pulse size="xs" />
            מערכת פעילה
          </div>
        </div>

        {/* ─── Login card ─────────────────────────────────────────────── */}
        <GlassPanel padding="lg" variant="strong">
          <div className="mb-5">
            <div className="label-micro mb-1">אימות כניסה</div>
            <h2 className="text-lg font-semibold text-white">כניסה למערכת</h2>
            <p className="text-sm mt-1" style={{ color: 'rgb(var(--ink-mute))' }}>הזן את שמך המלא וסיסמתך</p>
          </div>

          {apiError && (
            <div className="mb-4 rounded-xl px-4 py-3 text-sm border"
                 style={{
                   background: 'rgba(255,77,77,0.08)',
                   borderColor: 'rgba(255,77,77,0.3)',
                   color: '#FFB4B4',
                 }}>
              שגיאת התחברות לשרת — ודא שמשתני הסביבה של Supabase מוגדרים ושטבלאות הנתונים נוצרו
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="field-label">שם מלא</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && !isDisabled && handleLogin()}
                placeholder="לדוגמה: ישראל חסדאי"
                disabled={isDisabled}
                className="field disabled:opacity-50 disabled:cursor-not-allowed"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="field-label">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && !isDisabled && handleLogin()}
                placeholder="הזן סיסמה"
                disabled={isDisabled}
                className="field disabled:opacity-50 disabled:cursor-not-allowed"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm flex items-start gap-2" style={{ color: '#FFB4B4' }}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                {error}
              </p>
            )}

            <GlassButton
              onClick={handleLogin}
              disabled={isDisabled}
              size="lg"
              className="w-full mt-2"
              icon={isDisabled ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              )}
            >
              {isDisabled ? (loading ? 'טוען...' : 'מתחבר...') : 'כניסה'}
            </GlassButton>
          </div>
        </GlassPanel>

        <p className="text-center text-xs mt-6" style={{ color: 'rgb(var(--ink-dim))' }}>
          מסווג — לשימוש מורשים בלבד
        </p>
      </div>
    </div>
  )
}
