'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FlightDB, DroneBattery, Mission, Flight, isFlightComplete, missingFields } from '@/lib/types'
import { DRONES, droneLabel } from '@/lib/drones'
import { useInactivityLogout } from '@/lib/useInactivityLogout'

const BATTALIONS = ['גדוד אדומים', 'גדוד צפוני', 'גדוד דרומי', 'גדוד מודיעין', 'גדוד כללי']


// ── Mission grouping for history ──────────────────────────────────────────────
interface MissionGroup {
  key: string; date: string; missionName: string; missionNum: number
  flights: Flight[]; totalMinutes: number
}
function buildMissionGroups(flights: Flight[]): MissionGroup[] {
  const getKey = (f: Flight) => f.missionId ? `m:${f.missionId}` : `d:${f.date}||${f.missionName}`
  // Chronological pass to assign mission numbers per day
  const chrono = [...flights].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '')
  )
  const keyToNum: Record<string, number> = {}
  const dayCount: Record<string, number> = {}
  for (const f of chrono) {
    const key = getKey(f)
    if (!(key in keyToNum)) {
      dayCount[f.date] = (dayCount[f.date] || 0) + 1
      keyToNum[key] = dayCount[f.date]
    }
  }
  // Build groups (newest-date-first order)
  const groups = new Map<string, MissionGroup>()
  for (const f of [...flights].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.startTime || '').localeCompare(a.startTime || '')
  )) {
    const key = getKey(f)
    if (!groups.has(key)) {
      groups.set(key, { key, date: f.date, missionName: f.missionName, missionNum: keyToNum[key] ?? 1, flights: [], totalMinutes: 0 })
    }
    const g = groups.get(key)!
    g.flights.push(f)
    g.totalMinutes += f.duration
  }
  return Array.from(groups.values()).sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    return d !== 0 ? d : b.missionNum - a.missionNum
  })
}

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

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const cls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all'

  const handleSave = async () => {
    if (!current || !next || !confirm) { setError('יש למלא את כל השדות'); return }
    if (next !== confirm) { setError('הסיסמאות החדשות אינן תואמות'); return }
    if (next.length < 4) { setError('סיסמה חייבת להכיל לפחות 4 תווים'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשינוי סיסמה'); return }
      setSuccess(true)
      setTimeout(onClose, 1500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">🔑 שינוי סיסמה</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {success ? (
          <div className="text-center py-4 text-green-400 font-medium">הסיסמה עודכנה בהצלחה ✓</div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">סיסמה נוכחית</label>
              <input type="password" value={current} onChange={e => { setCurrent(e.target.value); setError('') }} className={cls} placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">סיסמה חדשה</label>
              <input type="password" value={next} onChange={e => { setNext(e.target.value); setError('') }} className={cls} placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">אישור סיסמה חדשה</label>
              <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }} className={cls} placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">ביטול</button>
              <button onClick={handleSave} disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all font-medium disabled:opacity-60">
                {loading ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PilotDashboard() {
  useInactivityLogout()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [db, setDb] = useState<FlightDB | null>(null)
  const [droneBatteries, setDroneBatteries] = useState<DroneBattery[]>([])
  const [activeTab, setActiveTab] = useState<'stats' | 'add' | 'history'>('stats')

  // ── Mission step (step 1) ─────────────────────────────────────────────────
  const [addStep, setAddStep] = useState<'mission' | 'flight'>('mission')
  const [missionForm, setMissionForm] = useState({ date: '', name: '', battalion: '', observer: '' })
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null)
  // missionPick: '' = nothing picked yet, 'new' = create new, otherwise = existing mission name
  const [missionPick, setMissionPick] = useState('')
  const [missionLoading, setMissionLoading] = useState(false)
  const [missionError, setMissionError] = useState('')

  // ── Flight step (step 2) ──────────────────────────────────────────────────
  const [flightForm, setFlightForm] = useState({
    tailNumber: '4x-pzk', battery: '', startTime: '', endTime: '',
    gasDropped: false, eventNumber: '',
  })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [showChangePwd, setShowChangePwd] = useState(false)

  useEffect(() => {
    // /api/auth/me reads is_admin FRESH from DB AND refreshes the JWT
    fetch('/api/auth/me', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    }).then(async r => {
      if (!r.ok) { window.location.href = '/'; return }
      const s = await r.json()
      // Only the true admin (אורן) is forced to the admin dashboard
      if (s.isAdmin) { window.location.href = '/admin'; return }
      setUserName(s.name)
    }).catch(() => { window.location.href = '/' })
  }, [])

  const fetchDB = useCallback(async () => {
    const res = await fetch('/api/flights')
    const data = await res.json()
    setDb(data)
  }, [])

  const fetchBatteries = useCallback(async () => {
    const res = await fetch('/api/drone-batteries', { cache: 'no-store' })
    if (res.ok) setDroneBatteries(await res.json())
  }, [])

  useEffect(() => { fetchDB() }, [fetchDB])
  useEffect(() => { fetchBatteries() }, [fetchBatteries])

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

  // ── Step 1: find or create mission ────────────────────────────────────────
  const handleMissionContinue = async () => {
    setMissionError('')
    if (!missionForm.date) { setMissionError('תאריך הוא שדה חובה'); return }

    const existingNamesOnDate = db
      ? Array.from(new Set(db.flights.filter(f => f.date === missionForm.date && f.missionName).map(f => f.missionName)))
      : []

    // Picking an existing mission
    if (existingNamesOnDate.length > 0 && missionPick && missionPick !== 'new') {
      setMissionLoading(true)
      try {
        const repFlight = db!.flights.find(f => f.date === missionForm.date && f.missionName === missionPick)
        if (repFlight?.missionId) {
          // Real missions-table entry exists — fetch it
          const res = await fetch(`/api/missions?date=${missionForm.date}`)
          if (res.ok) {
            const missions: Mission[] = await res.json()
            const mission = missions.find(m => m.id === repFlight.missionId)
            if (mission) { setSelectedMission(mission); setAddStep('flight'); return }
          }
        }
        // Legacy flight — create a missions-table entry for it
        const res = await fetch('/api/missions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: missionForm.date, name: missionPick,
            battalion: repFlight?.battalion ?? '', observer: repFlight?.observer ?? '',
          }),
        })
        if (!res.ok) { setMissionError('שגיאה ביצירת משימה'); return }
        const mission: Mission = await res.json()
        setSelectedMission(mission)
        setAddStep('flight')
      } finally {
        setMissionLoading(false)
      }
      return
    }

    // Creating a new mission
    if (existingNamesOnDate.length > 0 && !missionPick) {
      setMissionError('יש לבחור משימה קיימת או לבחור "צור משימה חדשה"')
      return
    }
    if (!missionForm.name.trim()) { setMissionError('שם משימה הוא שדה חובה'); return }
    setMissionLoading(true)
    try {
      const res = await fetch('/api/missions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: missionForm.date, name: missionForm.name.trim(), battalion: missionForm.battalion, observer: missionForm.observer }),
      })
      if (!res.ok) { setMissionError('שגיאה ביצירת משימה'); return }
      const mission: Mission = await res.json()
      setSelectedMission(mission)
      setAddStep('flight')
    } finally {
      setMissionLoading(false)
    }
  }

  // ── Step 2: save flight under mission ─────────────────────────────────────
  const handleSubmit = async () => {
    setFormError('')
    setFormSuccess('')
    if (!selectedMission) { setFormError('שגיאה: לא נבחרה משימה'); return }
    if (!pilot) { setFormError('שגיאה: טייס לא מזוהה'); return }
    const { startTime, endTime } = flightForm
    if (startTime && endTime) {
      const dur = calcDuration(startTime, endTime)
      if (dur <= 0) { setFormError('שעת סיום חייבת להיות לאחר שעת התחלה'); return }
    }
    const duration = startTime && endTime ? calcDuration(startTime, endTime) : 0
    const res = await fetch('/api/flights', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pilotId: pilot.id, pilotName: pilot.name,
        date: selectedMission.date, missionName: selectedMission.name,
        missionId: selectedMission.id,
        tailNumber: flightForm.tailNumber, battery: flightForm.battery,
        startTime, endTime, duration,
        observer: selectedMission.observer,
        gasDropped: flightForm.gasDropped, eventNumber: flightForm.eventNumber,
        battalion: selectedMission.battalion,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setFormError(err.error === 'DB_MIGRATION_NEEDED' ? 'שגיאת מערכת — פנה למפקד' : (err.error ?? `שגיאה בשמירה (${res.status})`)); return
    }
    setFormSuccess('טיסה נרשמה בהצלחה!')
    setFlightForm({ tailNumber: '4x-pzk', battery: '', startTime: '', endTime: '', gasDropped: false, eventNumber: '' })
    fetchDB()
  }

  const resetAddFlow = () => {
    setAddStep('mission')
    setMissionForm({ date: '', name: '', battalion: '', observer: '' })
    setSelectedMission(null)
    setMissionPick('')
    setFlightForm({ tailNumber: '4x-pzk', battery: '', startTime: '', endTime: '', gasDropped: false, eventNumber: '' })
    setFormError('')
    setFormSuccess('')
    setMissionError('')
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/flights?id=${id}`, { method: 'DELETE' })
    setConfirmId(null)
    fetchDB()
  }

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  const durationPreview = flightForm.startTime && flightForm.endTime ? calcDuration(flightForm.startTime, flightForm.endTime) : null

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
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}

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
            onClick={() => setShowChangePwd(true)}
            className="text-slate-400 hover:text-white text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 px-3 py-1.5 rounded-lg transition-all"
          >
            שנה סיסמה
          </button>
          <button
            onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => router.push('/'))}
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
            <p className="text-xs text-slate-400 mb-3">סה&quot;כ שעות</p>
            <p className="text-2xl font-bold text-blue-400">{fmtHours(totalMinutes)}</p>
            <p className="text-xs text-slate-500 mt-1">{Math.floor(totalMinutes / 60)}:{String(totalMinutes % 60).padStart(2,'0')} שעות</p>
          </div>
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-3">סה&quot;כ משימות</p>
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

            {/* Last 3 flights */}
            {myFlights.length > 0 && (
              <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">טיסות אחרונות</h2>
                <div className="space-y-3">
                  {myFlights.slice(0, 3).map(f => (
                    <div key={f.id} className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{f.missionName || '—'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(f.date).toLocaleDateString('he-IL')} · {droneLabel(f.tailNumber)}{f.battery ? ` · סוללה ${f.battery}` : ''}{f.observer ? ` · 👁 ${f.observer}` : ''}{f.gasDropped ? <span className="text-amber-400 font-medium"> · 💧 הטלת גז{f.eventNumber ? ` ${f.eventNumber}` : ''}</span> : ''}
                        </p>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <p className="text-sm font-bold text-blue-400">{f.duration > 0 ? fmtHours(f.duration) : '—'}</p>
                        <p className="text-xs text-slate-500">{f.startTime && f.endTime ? `${f.startTime}–${f.endTime}` : '—'}</p>
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
          <div className="space-y-4">
            {/* Step 1: Mission details */}
            {addStep === 'mission' && (() => {
              const existingNamesOnDate = db
                ? Array.from(new Set(db.flights.filter(f => f.date === missionForm.date && f.missionName).map(f => f.missionName)))
                : []
              const showDropdown = missionForm.date && existingNamesOnDate.length > 0
              const isCreatingNew = !showDropdown || missionPick === 'new'
              return (
              <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <span className="text-indigo-400">📋</span> שלב 1 — פרטי המשימה
                </h2>
                <p className="text-xs text-slate-500 mb-5">הגדר את המשימה. אחר כך תוסיף את פרטי הטיסה.</p>
                <div className="space-y-4">
                  {/* Date */}
                  <div>
                    <label className={labelCls}>תאריך <span className="text-red-400">*</span></label>
                    <input type="date" value={missionForm.date}
                      onChange={e => {
                        setMissionForm(f => ({ ...f, date: e.target.value, name: '' }))
                        setMissionPick('')
                      }}
                      className={inputCls} />
                  </div>

                  {/* Mission picker dropdown (shown when there are existing missions on this date) */}
                  {showDropdown && (
                    <div>
                      <label className={labelCls}>בחר משימה קיימת או צור חדשה <span className="text-red-400">*</span></label>
                      <select
                        value={missionPick}
                        onChange={e => setMissionPick(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">— בחר —</option>
                        {existingNamesOnDate.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="new">➕ צור משימה חדשה</option>
                      </select>
                    </div>
                  )}

                  {/* New mission fields (shown when creating new, or no existing missions) */}
                  {isCreatingNew && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>שם משימה <span className="text-red-400">*</span></label>
                        <input type="text" placeholder="מפ שועפט, חיפוי כוחות..." value={missionForm.name}
                          onChange={e => setMissionForm(f => ({ ...f, name: e.target.value }))}
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>גדוד (אופציונלי)</label>
                        <select value={missionForm.battalion} onChange={e => setMissionForm(f => ({ ...f, battalion: e.target.value }))} className={inputCls}>
                          <option value="">— בחר גדוד —</option>
                          {BATTALIONS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>תצפיתן (אופציונלי)</label>
                        <input type="text" value={missionForm.observer}
                          onChange={e => setMissionForm(f => ({ ...f, observer: e.target.value }))}
                          placeholder="שם התצפיתן..." className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>

                {missionError && (
                  <div className="mt-4 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 text-sm text-red-400">{missionError}</div>
                )}
                <button onClick={handleMissionContinue} disabled={missionLoading}
                  className="mt-5 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                  {missionLoading ? 'טוען...' : 'המשך לפרטי הטיסה'}
                  {!missionLoading && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>}
                </button>
              </div>
              )
            })()}

            {/* Step 2: Flight details */}
            {addStep === 'flight' && selectedMission && (
              <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
                {/* Mission banner */}
                <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                  <span className="text-indigo-400 text-lg">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{selectedMission.name}</p>
                    <p className="text-xs text-indigo-300/80">
                      משימה {selectedMission.missionNumber} · {new Date(selectedMission.date).toLocaleDateString('he-IL')}
                      {selectedMission.battalion ? ` · ${selectedMission.battalion}` : ''}
                      {selectedMission.observer ? ` · תצפיתן: ${selectedMission.observer}` : ''}
                    </p>
                  </div>
                  <button onClick={resetAddFlow} className="text-slate-500 hover:text-slate-300 text-xs shrink-0">שנה משימה</button>
                </div>

                <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
                  <span className="text-blue-400">✈️</span> שלב 2 — פרטי הטיסה
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>מספר זנב</label>
                    <select value={flightForm.tailNumber}
                      onChange={e => setFlightForm(f => ({ ...f, tailNumber: e.target.value, battery: '' }))}
                      className={inputCls}>
                      {DRONES.map(d => <option key={d.tailNumber} value={d.tailNumber}>{d.model} | {d.tailNumber}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>סוללה</label>
                    {(() => {
                      const bats = droneBatteries.filter(b => b.droneTailNumber === flightForm.tailNumber)
                      if (bats.length === 0) return (
                        <select disabled className={`${inputCls} opacity-50 cursor-not-allowed`}>
                          <option>אין סוללות רשומות לרחפן זה</option>
                        </select>
                      )
                      return (
                        <select value={flightForm.battery} onChange={e => setFlightForm(f => ({ ...f, battery: e.target.value }))} className={inputCls}>
                          <option value="">— בחר סוללה —</option>
                          {bats.map(b => <option key={b.id} value={b.batteryName}>{b.batteryName}</option>)}
                        </select>
                      )
                    })()}
                  </div>
                  <div>
                    <label className={labelCls}>שעת המראה</label>
                    <input type="time" value={flightForm.startTime}
                      onChange={e => setFlightForm(f => ({ ...f, startTime: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>שעת נחיתה</label>
                    <input type="time" value={flightForm.endTime}
                      onChange={e => setFlightForm(f => ({ ...f, endTime: e.target.value }))}
                      className={inputCls} />
                  </div>
                  {(flightForm.tailNumber === '4x-ujs' || flightForm.tailNumber === '4x-xpg') && (
                    <div className="sm:col-span-2 bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                      <p className="text-xs font-semibold text-amber-400 mb-3">הטלת גז</p>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={flightForm.gasDropped}
                          onChange={e => setFlightForm(f => ({ ...f, gasDropped: e.target.checked, eventNumber: e.target.checked ? f.eventNumber : '' }))}
                          className="w-4 h-4 accent-amber-500" />
                        <span className="text-sm text-amber-200">בוצעה הטלת גז?</span>
                      </label>
                      {flightForm.gasDropped && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-amber-400/80 mb-1.5">מספר אירוע</label>
                          <input type="text" value={flightForm.eventNumber}
                            onChange={e => setFlightForm(f => ({ ...f, eventNumber: e.target.value }))}
                            placeholder="מס׳ אירוע..." className={inputCls} />
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
                  <div className="mt-4 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 text-sm text-red-400">{formError}</div>
                )}
                {formSuccess ? (
                  <div className="mt-5 space-y-3">
                    <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 text-sm text-green-400 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      {formSuccess}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setFormSuccess(''); setFlightForm({ tailNumber: '4x-pzk', battery: '', startTime: '', endTime: '', gasDropped: false, eventNumber: '' }) }}
                        className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all font-medium">
                        טיסה נוספת למשימה זו
                      </button>
                      <button onClick={() => { resetAddFlow(); setActiveTab('history') }}
                        className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">
                        לדף היסטוריה
                      </button>
                    </div>
                    <button onClick={resetAddFlow}
                      className="w-full px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                      משימה חדשה
                    </button>
                  </div>
                ) : (
                  <button onClick={handleSubmit}
                    className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    רשום טיסה
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="text-blue-400">📜</span> היסטוריית טיסות שלי
              </h2>
              <span className="text-xs text-slate-400">{myFlights.length} טיסות</span>
            </div>
            {myFlights.length === 0 ? (
              <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-12 text-center">
                <div className="text-4xl mb-3">✈️</div>
                <p className="text-slate-400">אין טיסות רשומות עדיין</p>
                <button onClick={() => setActiveTab('add')}
                  className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  רשום את הטיסה הראשונה שלך
                </button>
              </div>
            ) : (
              buildMissionGroups(myFlights).map((group, gi) => (
                <div key={group.key} className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
                  {/* Mission header */}
                  <div className="bg-indigo-900/30 border-b border-indigo-700/30 px-5 py-3 flex items-center gap-3">
                    <span className="text-indigo-400 text-sm font-bold">📋 משימה {group.missionNum}</span>
                    <span className="text-white text-sm font-semibold truncate flex-1">
                      {group.missionName || <span className="text-slate-500 italic">ללא שם</span>}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {new Date(group.date).toLocaleDateString('he-IL')}
                    </span>
                    {group.totalMinutes > 0 && (
                      <span className="text-xs text-indigo-300 font-medium shrink-0">{fmtHours(group.totalMinutes)}</span>
                    )}
                  </div>
                  {/* Flights */}
                  <div className="divide-y divide-slate-700/30">
                    {group.flights.map((f, fi) => {
                      const complete = isFlightComplete(f)
                      const missing = complete ? [] : missingFields(f)
                      return (
                        <div key={f.id}
                          className={`px-5 py-3 transition-colors flex items-center justify-between gap-4 ${complete ? 'hover:bg-slate-700/20' : 'bg-red-900/20 hover:bg-red-900/30'}`}
                          title={complete ? undefined : `חסרים: ${missing.join(', ')}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-slate-500">טיסה {fi + 1}</span>
                              {!complete && (
                                <span className="text-xs bg-red-900/40 border border-red-700/50 text-red-400 px-1.5 py-0.5 rounded-md">חסר מידע</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                              <span>✈️ {droneLabel(f.tailNumber)}</span>
                              {f.battery && <span>🔋 {f.battery}</span>}
                              {f.startTime && f.endTime && <span>🕐 {f.startTime}–{f.endTime}</span>}
                              {f.observer && <span>👁 {f.observer}</span>}
                              {f.gasDropped && (
                                <span className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-700/50 text-amber-400 font-medium px-2 py-0.5 rounded-md">
                                  💧 הטלת גז{f.eventNumber ? ` ${f.eventNumber}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-bold text-blue-400">{f.duration > 0 ? fmtHours(f.duration) : '—'}</p>
                            </div>
                            <button onClick={() => setConfirmId(f.id)} title="מחיקה"
                              className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
