'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FlightDB } from '@/lib/types'
import { DRONES, droneLabel } from '@/lib/drones'

const BATTERY_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-600/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">האם אתה בטוח?</h3>
            <p className="text-xs text-slate-400 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all">
            ביטול
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all font-medium">
            מחק
          </button>
        </div>
      </div>
    </div>
  )
}

function fmtHours(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}ד'`
  return m === 0 ? `${h}ש'` : `${h}ש' ${m}ד'`
}

function calcDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

export default function PilotDashboard() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [db, setDb] = useState<FlightDB | null>(null)
  const [activeTab, setActiveTab] = useState<'stats' | 'add' | 'history'>('stats')
  const [form, setForm] = useState({
    date: '', missionName: '', tailNumber: '4x-pzk',
    battery: 'A', startTime: '', endTime: '', batteryStart: '', batteryEnd: '',
    observer: '', gasDropped: false, gasDropTime: '',
  })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    const user = sessionStorage.getItem('currentUser')
    if (!user || user === 'אורן וייסבלום') { router.replace('/'); return }
    setUserName(user)
  }, [router])

  const fetchDB = useCallback(async () => {
    const res = await fetch('/api/flights')
    const data = await res.json()
    setDb(data)
  }, [])

  useEffect(() => { fetchDB() }, [fetchDB])

  if (!db || !userName) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const pilot = db.pilots.find(p => p.name === userName)
  const myFlights = pilot
    ? db.flights.filter(f => f.pilotId === pilot.id).sort((a, b) => b.date.localeCompare(a.date))
    : []

  const totalMinutes = myFlights.reduce((a, f) => a + f.duration, 0)
  const lastFlight = myFlights[0] ?? null

  const handleSubmit = async () => {
    setFormError('')
    setFormSuccess('')
    const { date, missionName, tailNumber, battery, startTime, endTime, batteryStart, batteryEnd } = form
    if (!date || !missionName || !startTime || !endTime || !batteryStart || !batteryEnd) {
      setFormError('יש למלא את כל השדות')
      return
    }
    const bs = Number(batteryStart), be = Number(batteryEnd)
    if (bs < 0 || bs > 100 || be < 0 || be > 100) {
      setFormError('אחוז סוללה חייב להיות בין 0 ל-100')
      return
    }
    const dur = calcDuration(startTime, endTime)
    if (dur <= 0) { setFormError('שעת סיום חייבת להיות לאחר שעת התחלה'); return }

    if (!pilot) { setFormError('שגיאה: טייס לא מזוהה'); return }

    const res = await fetch('/api/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pilotId: pilot.id, pilotName: pilot.name, date, missionName, tailNumber,
        battery, startTime, endTime, batteryStart: bs, batteryEnd: be, duration: dur,
        observer: form.observer, gasDropped: form.gasDropped, gasDropTime: form.gasDropTime,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setFormError(err.error ?? `שגיאה בשמירה (${res.status})`); return
    }
    setFormSuccess('טיסה נרשמה בהצלחה!')
    setForm({ date: '', missionName: '', tailNumber: '4x-pzk', battery: 'A', startTime: '', endTime: '', batteryStart: '', batteryEnd: '', observer: '', gasDropped: false, gasDropTime: '' })
    fetchDB()
    setTimeout(() => setActiveTab('history'), 1200)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/flights?id=${id}`, { method: 'DELETE' })
    setConfirmId(null)
    fetchDB()
  }

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  // Compute duration preview
  const durationPreview = form.startTime && form.endTime ? calcDuration(form.startTime, form.endTime) : null

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Confirm dialog */}
      {confirmId && (
        <ConfirmDialog
          message="פעולה זו תמחק את רשומת הטיסה לצמיתות."
          onConfirm={() => handleDelete(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700/50 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-sm font-bold text-blue-400">
              {userName[0]}
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">{userName}</h1>
              <p className="text-xs text-slate-500">
                {pilot ? `רישיון ${pilot.license}` : 'טייס רחפן'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { sessionStorage.clear(); router.push('/') }}
            className="text-slate-400 hover:text-white text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 px-3 py-1.5 rounded-lg transition-all"
          >
            יציאה
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Personal stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-3">סה"כ שעות</p>
            <p className="text-2xl font-bold text-blue-400">{fmtHours(totalMinutes)}</p>
            <p className="text-xs text-slate-500 mt-1">{Math.floor(totalMinutes / 60)}:{String(totalMinutes % 60).padStart(2,'0')} שעות</p>
          </div>
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-3">סה"כ משימות</p>
            <p className="text-2xl font-bold text-indigo-400">{myFlights.length}</p>
            <p className="text-xs text-slate-500 mt-1">טיסות רשומות</p>
          </div>
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-3">משימה אחרונה</p>
            <p className="text-2xl font-bold text-violet-400">{lastFlight ? fmtHours(lastFlight.duration) : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">
              {lastFlight ? new Date(lastFlight.date).toLocaleDateString('he-IL') : 'אין נתונים'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1">
          {([
            { key: 'stats', label: 'סטטיסטיקות', icon: '📊' },
            { key: 'add', label: 'רישום טיסה', icon: '✈️' },
            { key: 'history', label: 'היסטוריה', icon: '📜' },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${activeTab === key ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <div className="space-y-5">
            {/* Flight activity chart */}
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-white mb-5">פעילות לפי חודש</h2>
              {(() => {
                const monthMap: Record<string, number> = {}
                myFlights.forEach(f => {
                  const key = f.date.slice(0, 7)
                  monthMap[key] = (monthMap[key] || 0) + f.duration
                })
                const entries = Object.entries(monthMap).sort()
                const maxMins = Math.max(...entries.map(([, v]) => v), 1)
                if (entries.length === 0) return <p className="text-slate-500 text-sm">אין נתונים</p>
                return (
                  <div className="space-y-3">
                    {entries.map(([key, mins]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-20 text-right flex-shrink-0">
                          {new Date(key + '-01').toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })}
                        </span>
                        <div className="flex-1 bg-slate-700/50 rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-l from-blue-600 to-indigo-500 rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                            style={{ width: `${Math.max((mins / maxMins) * 100, 5)}%` }}
                          >
                            <span className="text-xs text-white font-medium">{fmtHours(mins)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Battery usage breakdown */}
            {myFlights.length > 0 && (
              <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">שימוש בסוללות</h2>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {BATTERY_LABELS.map(bat => {
                    const count = myFlights.filter(f => f.battery === bat).length
                    return (
                      <div key={bat} className="bg-slate-700/40 rounded-xl p-3 text-center border border-slate-600/30">
                        <p className="text-xs text-slate-400 mb-1">סוללה {bat}</p>
                        <p className="text-xl font-bold text-blue-400">{count}</p>
                        <p className="text-xs text-slate-500">טיסות</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Last 3 flights */}
            {myFlights.length > 0 && (
              <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">טיסות אחרונות</h2>
                <div className="space-y-3">
                  {myFlights.slice(0, 3).map(f => (
                    <div key={f.id} className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{f.missionName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(f.date).toLocaleDateString('he-IL')} · {droneLabel(f.tailNumber)} · סוללה {f.battery}{f.observer ? ` · 👁 ${f.observer}` : ''}{f.gasDropped ? <span className="text-amber-400 font-medium"> · 💧 הטלת גז{f.gasDropTime ? ` ${f.gasDropTime}` : ''}</span> : ''}
                        </p>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <p className="text-sm font-bold text-blue-400">{fmtHours(f.duration)}</p>
                        <p className="text-xs text-slate-500">{f.startTime}–{f.endTime}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADD FLIGHT TAB */}
        {activeTab === 'add' && (
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-blue-400">✈️</span> רישום טיסה חדשה
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>תאריך</label>
                <input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>שם משימה</label>
                <input type="text" placeholder="סיור לילי, תרגיל..." value={form.missionName}
                  onChange={e => setForm(f => ({ ...f, missionName: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>מספר זנב</label>
                <select value={form.tailNumber}
                  onChange={e => setForm(f => ({ ...f, tailNumber: e.target.value }))}
                  className={inputCls}>
                  {DRONES.map(d => <option key={d.tailNumber} value={d.tailNumber}>{d.model} | {d.tailNumber}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>סוללה</label>
                <select value={form.battery}
                  onChange={e => setForm(f => ({ ...f, battery: e.target.value }))}
                  className={inputCls}>
                  {BATTERY_LABELS.map(b => (
                    <option key={b} value={b}>סוללה {b} (כרגע: {db.batteries[b]}%)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>שעת המראה</label>
                <input type="time" value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>שעת נחיתה</label>
                <input type="time" value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>% סוללה — תחילה</label>
                <input type="number" min="0" max="100" placeholder="100" value={form.batteryStart}
                  onChange={e => setForm(f => ({ ...f, batteryStart: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>% סוללה — סיום</label>
                <input type="number" min="0" max="100" placeholder="40" value={form.batteryEnd}
                  onChange={e => setForm(f => ({ ...f, batteryEnd: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>תצפיתן (אופציונלי)</label>
                <input type="text" value={form.observer}
                  onChange={e => setForm(f => ({ ...f, observer: e.target.value }))}
                  placeholder="שם התצפיתן..." className={inputCls} />
              </div>
              {form.tailNumber === '4x-ujs' && (
                <div className="sm:col-span-2 bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-400 mb-3">הטלת גז</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.gasDropped}
                      onChange={e => setForm(f => ({ ...f, gasDropped: e.target.checked, gasDropTime: e.target.checked ? f.gasDropTime : '' }))}
                      className="w-4 h-4 accent-amber-500" />
                    <span className="text-sm text-amber-200">בוצעה הטלת גז?</span>
                  </label>
                  {form.gasDropped && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-amber-400/80 mb-1.5">שעת הטלה</label>
                      <input type="time" value={form.gasDropTime}
                        onChange={e => setForm(f => ({ ...f, gasDropTime: e.target.value }))}
                        className={inputCls} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Duration preview */}
            {durationPreview !== null && durationPreview > 0 && (
              <div className="mt-4 bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3 text-sm text-blue-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                משך טיסה מחושב: <strong>{fmtHours(durationPreview)}</strong> ({durationPreview} דקות)
              </div>
            )}

            {formError && (
              <div className="mt-4 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 text-sm text-red-400">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="mt-4 bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 text-sm text-green-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {formSuccess}
              </div>
            )}

            <button
              onClick={handleSubmit}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              רשום טיסה
            </button>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="text-blue-400">📜</span> היסטוריית טיסות שלי ({myFlights.length})
              </h2>
            </div>
            {myFlights.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-3">✈️</div>
                <p className="text-slate-400">אין טיסות רשומות עדיין</p>
                <button onClick={() => setActiveTab('add')}
                  className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  רשום את הטיסה הראשונה שלך
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/30">
                {myFlights.map((f, i) => (
                  <div key={f.id} className="px-6 py-4 hover:bg-slate-700/20 transition-colors flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-500">#{myFlights.length - i}</span>
                        <h3 className="text-sm font-semibold text-white truncate">{f.missionName}</h3>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>📅 {new Date(f.date).toLocaleDateString('he-IL')}</span>
                        <span>✈️ {droneLabel(f.tailNumber)}</span>
                        <span>🔋 סוללה {f.battery}: {f.batteryStart}% ← {f.batteryEnd}%</span>
                        <span>🕐 {f.startTime}–{f.endTime}</span>
                        {f.observer && <span>👁 {f.observer}</span>}
                        {f.gasDropped && (
                          <span className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-700/50 text-amber-400 font-medium px-2 py-0.5 rounded-md">
                            💧 הטלת גז{f.gasDropTime ? ` ${f.gasDropTime}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-base font-bold text-blue-400">{fmtHours(f.duration)}</p>
                        <p className="text-xs text-slate-500">{f.duration} דק'</p>
                      </div>
                      <button
                        onClick={() => setConfirmId(f.id)}
                        title="מחיקה"
                        className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20 mt-0.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
