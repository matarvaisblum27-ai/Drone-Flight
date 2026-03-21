'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pilot } from '@/lib/types'

export default function LoginPage() {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pilots, setPilots] = useState<Pilot[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(false)
  const router = useRouter()

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
      let data: { ok?: boolean; isAdmin?: boolean; error?: string } = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (!res.ok) {
        setError(data.error === 'invalid_credentials' ? 'שם משתמש או סיסמה שגויים' : `שגיאת שרת (${res.status})`)
        return
      }
      // Full page navigation ensures the httpOnly cookie is committed by the
      // browser before the next request fires (router.push uses RSC fetch which
      // can race against Set-Cookie processing).
      window.location.href = data.isAdmin ? '/admin' : '/pilot'
    } catch {
      setError('שגיאת רשת — בדוק חיבור לאינטרנט ונסה שוב')
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = loading || submitting

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <img src="/logo.png" alt="לוגו יחידה" className="w-56 h-56 object-contain drop-shadow-2xl" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wide">מערכת ניהול טיסות</h1>
          <p className="text-slate-400 mt-2 text-sm">יחידת רחפנים | מסווג</p>
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-blue-400/70 bg-blue-900/20 px-3 py-1 rounded-full border border-blue-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            מערכת פעילה
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-slate-100 mb-1">כניסה למערכת</h2>
          <p className="text-slate-400 text-sm mb-6">הזן את שמך המלא וסיסמתך</p>

          {apiError && (
            <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-sm text-red-400">
              שגיאת התחברות לשרת — ודא שמשתני הסביבה של Supabase מוגדרים ושטבלאות הנתונים נוצרו
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">שם מלא</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && !isDisabled && handleLogin()}
                placeholder="לדוגמה: ישראל חסדאי"
                disabled={isDisabled}
                className="w-full bg-slate-700/60 border border-slate-600/60 rounded-xl px-4 py-3 text-white placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-right
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && !isDisabled && handleLogin()}
                placeholder="הזן סיסמה"
                disabled={isDisabled}
                className="w-full bg-slate-700/60 border border-slate-600/60 rounded-xl px-4 py-3 text-white placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-right
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              {error && (
                <p className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  {error}
                </p>
              )}
            </div>

            <button
              onClick={handleLogin}
              disabled={isDisabled}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3 px-4
                rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30
                disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDisabled ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {loading ? 'טוען...' : 'מתחבר...'}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  כניסה
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">מסווג — לשימוש מורשים בלבד</p>
      </div>
    </div>
  )
}
