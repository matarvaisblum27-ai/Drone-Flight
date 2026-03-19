'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FlightDB, Flight, Pilot, PilotStats } from '@/lib/types'

const ADMIN_NAME = 'אורן וייסבלום'
const BATTERY_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']
const TAIL_NUMBERS = ['4X-YAA', '4X-YAB', '4X-YAC', '4X-YAD']

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

function batteryColor(pct: number) {
  if (pct >= 60) return 'text-green-400'
  if (pct >= 30) return 'text-yellow-400'
  return 'text-red-400'
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
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

// ── Edit modal ────────────────────────────────────────────────────────────────
type EditForm = {
  pilotId: string; date: string; missionName: string; tailNumber: string
  battery: string; startTime: string; endTime: string; batteryStart: string; batteryEnd: string
}

function EditModal({ flight, db, onSave, onCancel }: {
  flight: Flight
  db: FlightDB
  onSave: (updated: EditForm) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EditForm>({
    pilotId: flight.pilotId,
    date: flight.date,
    missionName: flight.missionName,
    tailNumber: flight.tailNumber,
    battery: flight.battery,
    startTime: flight.startTime,
    endTime: flight.endTime,
    batteryStart: String(flight.batteryStart),
    batteryEnd: String(flight.batteryEnd),
  })
  const [error, setError] = useState('')

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  const durationPreview = form.startTime && form.endTime ? calcDuration(form.startTime, form.endTime) : null

  const handleSave = () => {
    const { date, missionName, pilotId, startTime, endTime, batteryStart, batteryEnd } = form
    if (!date || !missionName || !pilotId || !startTime || !endTime || !batteryStart || !batteryEnd) {
      setError('יש למלא את כל השדות'); return
    }
    const bs = Number(batteryStart), be = Number(batteryEnd)
    if (bs < 0 || bs > 100 || be < 0 || be > 100) { setError('אחוז סוללה: 0–100'); return }
    const dur = calcDuration(startTime, endTime)
    if (dur <= 0) { setError('שעת סיום חייבת להיות לאחר שעת התחלה'); return }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-700/60 rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="text-blue-400">✏️</span> עריכת רשומת טיסה
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>טייס</label>
            <select value={form.pilotId} onChange={e => setForm(f => ({ ...f, pilotId: e.target.value }))} className={inputCls}>
              {db.pilots.map(p => <option key={p.id} value={p.id}>{p.name} — {p.license}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>תאריך</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>שם משימה</label>
            <input type="text" value={form.missionName} onChange={e => setForm(f => ({ ...f, missionName: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>מספר זנב</label>
            <select value={form.tailNumber} onChange={e => setForm(f => ({ ...f, tailNumber: e.target.value }))} className={inputCls}>
              {TAIL_NUMBERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>סוללה</label>
            <select value={form.battery} onChange={e => setForm(f => ({ ...f, battery: e.target.value }))} className={inputCls}>
              {BATTERY_LABELS.map(b => <option key={b} value={b}>סוללה {b}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>שעת המראה</label>
            <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>שעת נחיתה</label>
            <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>% סוללה — תחילה</label>
            <input type="number" min="0" max="100" value={form.batteryStart}
              onChange={e => setForm(f => ({ ...f, batteryStart: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>% סוללה — סיום</label>
            <input type="number" min="0" max="100" value={form.batteryEnd}
              onChange={e => setForm(f => ({ ...f, batteryEnd: e.target.value }))} className={inputCls} />
          </div>
        </div>

        {durationPreview !== null && durationPreview > 0 && (
          <div className="mt-4 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 text-xs text-blue-300">
            משך מחושב: <strong>{fmtHours(durationPreview)}</strong> ({durationPreview} דקות)
          </div>
        )}
        {error && (
          <div className="mt-4 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-sm text-red-400">{error}</div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">
            ביטול
          </button>
          <button onClick={handleSave}
            className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all font-medium">
            שמור שינויים
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pilot edit modal ──────────────────────────────────────────────────────────
function PilotEditModal({ pilot, onSave, onCancel }: {
  pilot: Pilot | null  // null = add mode
  onSave: (name: string, license: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(pilot?.name ?? '')
  const [license, setLicense] = useState(pilot?.license ?? '')
  const [error, setError] = useState('')

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  const handleSave = () => {
    if (!name.trim() || !license.trim()) { setError('יש למלא שם ומספר רישיון'); return }
    onSave(name.trim(), license.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="text-blue-400">{pilot ? '✏️' : '➕'}</span>
            {pilot ? 'עריכת טייס' : 'הוספת טייס חדש'}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>שם מלא</label>
            <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }}
              placeholder="ישראל ישראלי" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>מספר רישיון</label>
            <input type="text" value={license} onChange={e => { setLicense(e.target.value); setError('') }}
              placeholder="123456" className={inputCls} />
          </div>
        </div>
        {error && <div className="mt-3 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-sm text-red-400">{error}</div>}
        <div className="flex gap-2 mt-6">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">
            ביטול
          </button>
          <button onClick={handleSave}
            className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all font-medium">
            {pilot ? 'שמור שינויים' : 'הוסף טייס'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter()
  const [db, setDb] = useState<FlightDB | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'ranking' | 'add' | 'history' | 'pilots'>('overview')
  const [addForm, setAddForm] = useState({
    pilotId: '', date: '', missionName: '', tailNumber: '4X-YAA',
    battery: 'A', startTime: '', endTime: '', batteryStart: '', batteryEnd: '',
  })
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [summaryMode, setSummaryMode] = useState<'monthly' | 'yearly'>('monthly')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmPilotId, setConfirmPilotId] = useState<string | null>(null)
  const [editFlight, setEditFlight] = useState<Flight | null>(null)
  const [editPilot, setEditPilot] = useState<Pilot | 'add' | null>(null)

  useEffect(() => {
    const user = sessionStorage.getItem('currentUser')
    if (user !== ADMIN_NAME) router.replace('/')
  }, [router])

  const fetchDB = useCallback(async () => {
    const res = await fetch('/api/flights', { cache: 'no-store' })
    setDb(await res.json())
  }, [])

  useEffect(() => { fetchDB() }, [fetchDB])

  if (!db) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Stats
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totalMinutes = db.flights.reduce((a, f) => a + f.duration, 0)
  const missionsThisMonth = db.flights.filter(f => f.date.startsWith(thisMonth)).length
  const avgDuration = db.flights.length ? Math.round(totalMinutes / db.flights.length) : 0

  const pilotStats: PilotStats[] = db.pilots.map(pilot => {
    const pFlights = db.flights.filter(f => f.pilotId === pilot.id)
    const totalMins = pFlights.reduce((a, f) => a + f.duration, 0)
    const sorted = [...pFlights].sort((a, b) => b.date.localeCompare(a.date))
    return { pilot, totalMinutes: totalMins, totalFlights: pFlights.length, lastFlightDate: sorted[0]?.date ?? '—', lastDuration: sorted[0]?.duration ?? 0 }
  }).sort((a, b) => b.totalMinutes - a.totalMinutes)
  const maxMinutes = pilotStats[0]?.totalMinutes ?? 1

  const summaryMap: Record<string, number> = {}
  db.flights.forEach(f => {
    const key = summaryMode === 'monthly' ? f.date.slice(0, 7) : f.date.slice(0, 4)
    summaryMap[key] = (summaryMap[key] || 0) + f.duration
  })
  const summaryEntries = Object.entries(summaryMap).sort((a, b) => b[0].localeCompare(a[0]))
  const maxSummaryMins = Math.max(...summaryEntries.map(([, v]) => v), 1)

  const handleAddFlight = async () => {
    setAddError(''); setAddSuccess('')
    const { pilotId, date, missionName, tailNumber, battery, startTime, endTime, batteryStart, batteryEnd } = addForm
    if (!pilotId || !date || !missionName || !tailNumber || !startTime || !endTime || !batteryStart || !batteryEnd) {
      setAddError('יש למלא את כל השדות'); return
    }
    const bs = Number(batteryStart), be = Number(batteryEnd)
    if (bs < 0 || bs > 100 || be < 0 || be > 100) { setAddError('אחוז סוללה: 0–100'); return }
    const dur = calcDuration(startTime, endTime)
    if (dur <= 0) { setAddError('שעת סיום חייבת להיות לאחר שעת התחלה'); return }
    const pilot = db.pilots.find(p => p.id === pilotId)!
    await fetch('/api/flights', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pilotId, pilotName: pilot.name, date, missionName, tailNumber, battery, startTime, endTime, batteryStart: bs, batteryEnd: be, duration: dur }),
    })
    setAddSuccess(`טיסה נוספה בהצלחה עבור ${pilot.name}`)
    setAddForm({ pilotId: '', date: '', missionName: '', tailNumber: '4X-YAA', battery: 'A', startTime: '', endTime: '', batteryStart: '', batteryEnd: '' })
    fetchDB()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/flights?id=${id}`, { method: 'DELETE' })
    setConfirmId(null)
    fetchDB()
  }

  const handleEdit = async (form: EditForm) => {
    if (!editFlight) return
    const pilot = db.pilots.find(p => p.id === form.pilotId)!
    const duration = calcDuration(form.startTime, form.endTime)
    await fetch('/api/flights', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editFlight.id, pilotId: form.pilotId, pilotName: pilot.name,
        date: form.date, missionName: form.missionName, tailNumber: form.tailNumber,
        battery: form.battery, startTime: form.startTime, endTime: form.endTime,
        batteryStart: Number(form.batteryStart), batteryEnd: Number(form.batteryEnd), duration,
      }),
    })
    setEditFlight(null)
    fetchDB()
  }

  const handleAddPilot = async (name: string, license: string) => {
    const res = await fetch('/api/pilots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, license }),
    })
    if (!res.ok) {
      if (res.status === 409) alert('טייס עם שם זה כבר קיים במערכת')
      else alert('שגיאה בהוספת טייס')
      return
    }
    const newPilot: Pilot = await res.json()
    setDb(prev => prev ? { ...prev, pilots: [...prev.pilots, newPilot] } : prev)
    setEditPilot(null)
    fetchDB()
  }

  const handleEditPilot = async (name: string, license: string) => {
    if (!editPilot || editPilot === 'add') return
    const pilot = editPilot as Pilot
    const res = await fetch('/api/pilots', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pilot.id, name, license }),
    })
    if (!res.ok) { alert('שגיאה בעריכת טייס'); return }
    setDb(prev => prev ? {
      ...prev,
      pilots: prev.pilots.map(p => p.id === pilot.id ? { ...p, name, license } : p),
    } : prev)
    setEditPilot(null)
    fetchDB()
  }

  const handleDeletePilot = async (id: string) => {
    const res = await fetch(`/api/pilots?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('שגיאה במחיקת טייס'); return }
    setDb(prev => prev ? { ...prev, pilots: prev.pilots.filter(p => p.id !== id) } : prev)
    setConfirmPilotId(null)
    fetchDB()
  }

  const sortedHistory = [...db.flights].sort((a, b) => b.date.localeCompare(a.date))
  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Modals */}
      {confirmId && (
        <ConfirmDialog
          message="פעולה זו תמחק את רשומת הטיסה לצמיתות."
          onConfirm={() => handleDelete(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
      {editFlight && (
        <EditModal
          flight={editFlight}
          db={db}
          onSave={handleEdit}
          onCancel={() => setEditFlight(null)}
        />
      )}
      {confirmPilotId && (
        <ConfirmDialog
          message="מחיקת טייס תסיר אותו מהמערכת. רשומות הטיסה שלו יישארו בהיסטוריה."
          onConfirm={() => handleDeletePilot(confirmPilotId)}
          onCancel={() => setConfirmPilotId(null)}
        />
      )}
      {editPilot !== null && (
        <PilotEditModal
          pilot={editPilot === 'add' ? null : editPilot as Pilot}
          onSave={editPilot === 'add' ? handleAddPilot : handleEditPilot}
          onCancel={() => setEditPilot(null)}
        />
      )}

      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700/50 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">לוח בקרה — מפקד</h1>
              <p className="text-xs text-slate-500">יחידת רחפנים</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300 hidden sm:block">{ADMIN_NAME}</span>
            <span className="text-xs bg-blue-600/20 text-blue-400 border border-blue-700/40 px-2 py-0.5 rounded-full">מפקד</span>
            <button onClick={() => { sessionStorage.clear(); router.push('/') }}
              className="text-slate-400 hover:text-white text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 px-3 py-1.5 rounded-lg transition-all">
              יציאה
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'סה"כ שעות טיסה', value: fmtHours(totalMinutes), icon: '🕐' },
            { label: 'טייסים פעילים', value: db.pilots.length, icon: '👨‍✈️' },
            { label: 'משימות החודש', value: missionsThisMonth, icon: '📋' },
            { label: 'ממוצע לטיסה', value: `${avgDuration}ד'`, icon: '⏱️' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 hover:border-blue-700/40 transition-all">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-slate-400 leading-tight">{label}</p>
                <span className="text-xl">{icon}</span>
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 overflow-x-auto">
          {([
            { key: 'overview', label: 'סקירה', icon: '📊' },
            { key: 'ranking', label: 'דירוג טייסים', icon: '🏆' },
            { key: 'add', label: 'הוספת טיסה', icon: '➕' },
            { key: 'history', label: 'היסטוריה', icon: '📜' },
            { key: 'pilots', label: 'ניהול טייסים', icon: '👨‍✈️' },
          ] as const).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${activeTab === key ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <span className="text-blue-400">🔋</span> מצב סוללות
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {BATTERY_LABELS.map(bat => {
                  const pct = db.batteries[bat] ?? 0
                  return (
                    <div key={bat} className="bg-slate-700/40 rounded-xl p-4 text-center border border-slate-600/30">
                      <p className="text-xs text-slate-400 mb-2">סוללה {bat}</p>
                      <div className="relative w-12 h-12 mx-auto mb-2">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#334155" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.9" fill="none"
                            stroke={pct >= 60 ? '#22c55e' : pct >= 30 ? '#eab308' : '#ef4444'}
                            strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`}
                            strokeDashoffset="25" strokeLinecap="round" />
                        </svg>
                        <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${batteryColor(pct)}`}>{pct}%</span>
                      </div>
                      <div className={`text-xs font-medium ${batteryColor(pct)}`}>
                        {pct >= 60 ? 'תקין' : pct >= 30 ? 'בינוני' : 'נמוך'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className="text-blue-400">📈</span> סיכום טיסות
                </h2>
                <div className="flex gap-1 bg-slate-700/50 rounded-lg p-0.5">
                  {(['monthly', 'yearly'] as const).map(m => (
                    <button key={m} onClick={() => setSummaryMode(m)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all
                        ${summaryMode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {m === 'monthly' ? 'חודשי' : 'שנתי'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {summaryEntries.slice(0, 8).map(([key, mins]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-16 text-right flex-shrink-0">
                      {summaryMode === 'monthly'
                        ? new Date(key + '-01').toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
                        : key}
                    </span>
                    <div className="flex-1 bg-slate-700/50 rounded-full h-5 overflow-hidden">
                      <div className="h-full bg-gradient-to-l from-blue-600 to-blue-400 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.max((mins / maxSummaryMins) * 100, 4)}%` }}>
                        <span className="text-xs text-white font-medium whitespace-nowrap">{fmtHours(mins)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* RANKING */}
        {activeTab === 'ranking' && (
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span className="text-yellow-400">🏆</span> דירוג טייסים לפי שעות טיסה מצטברות
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/30 text-right">
                    {['#', 'שם', 'רישיון', 'טיסות', 'סה"כ', 'התפלגות', 'טיסה אחרונה'].map(h => (
                      <th key={h} className="px-6 py-3 text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {pilotStats.map((ps, i) => (
                    <tr key={ps.pilot.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>{i + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-700/40 flex items-center justify-center text-xs font-bold text-blue-400">
                            {ps.pilot.name[0]}
                          </div>
                          <span className="text-sm font-medium text-white">{ps.pilot.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400 font-mono">{ps.pilot.license}</td>
                      <td className="px-6 py-4 text-sm text-slate-300">{ps.totalFlights}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-blue-400">{fmtHours(ps.totalMinutes)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700/50 rounded-full h-3 overflow-hidden">
                            <div className="h-full bg-gradient-to-l from-blue-500 to-blue-600 rounded-full transition-all duration-700"
                              style={{ width: `${(ps.totalMinutes / maxMinutes) * 100}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8">{Math.round((ps.totalMinutes / maxMinutes) * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {ps.lastFlightDate !== '—' ? new Date(ps.lastFlightDate).toLocaleDateString('he-IL') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ADD FLIGHT */}
        {activeTab === 'add' && (
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-6 max-w-2xl mx-auto">
            <h2 className="text-base font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-blue-400">➕</span> הוספת רשומת טיסה
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>טייס</label>
                <select value={addForm.pilotId} onChange={e => setAddForm(f => ({ ...f, pilotId: e.target.value }))} className={inputCls}>
                  <option value="">בחר טייס...</option>
                  {db.pilots.map(p => <option key={p.id} value={p.id}>{p.name} — {p.license}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>תאריך</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>שם משימה</label>
                <input type="text" placeholder="סיור לילי..." value={addForm.missionName}
                  onChange={e => setAddForm(f => ({ ...f, missionName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>מספר זנב</label>
                <select value={addForm.tailNumber} onChange={e => setAddForm(f => ({ ...f, tailNumber: e.target.value }))} className={inputCls}>
                  {TAIL_NUMBERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>סוללה</label>
                <select value={addForm.battery} onChange={e => setAddForm(f => ({ ...f, battery: e.target.value }))} className={inputCls}>
                  {BATTERY_LABELS.map(b => <option key={b} value={b}>סוללה {b} (כרגע: {db.batteries[b]}%)</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>שעת המראה</label>
                <input type="time" value={addForm.startTime} onChange={e => setAddForm(f => ({ ...f, startTime: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>שעת נחיתה</label>
                <input type="time" value={addForm.endTime} onChange={e => setAddForm(f => ({ ...f, endTime: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>% סוללה — תחילה</label>
                <input type="number" min="0" max="100" placeholder="100" value={addForm.batteryStart}
                  onChange={e => setAddForm(f => ({ ...f, batteryStart: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>% סוללה — סיום</label>
                <input type="number" min="0" max="100" placeholder="40" value={addForm.batteryEnd}
                  onChange={e => setAddForm(f => ({ ...f, batteryEnd: e.target.value }))} className={inputCls} />
              </div>
            </div>
            {addError && <div className="mt-4 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 text-sm text-red-400">{addError}</div>}
            {addSuccess && (
              <div className="mt-4 bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 text-sm text-green-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {addSuccess}
              </div>
            )}
            <button onClick={handleAddFlight}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              שמור רשומת טיסה
            </button>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span className="text-blue-400">📜</span> היסטוריית טיסות ({db.flights.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-700/30 text-right">
                    {['תאריך', 'טייס', 'משימה', 'זנב', 'סוללה', 'שעות', 'משך', 'פעולות'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {sortedHistory.map(f => (
                    <tr key={f.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {new Date(f.date).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{f.pilotName}</td>
                      <td className="px-4 py-3 text-slate-300">{f.missionName}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{f.tailNumber}</td>
                      <td className="px-4 py-3">
                        <span className="bg-slate-700/50 px-2 py-0.5 rounded text-xs text-slate-300">{f.battery}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{f.startTime}–{f.endTime}</td>
                      <td className="px-4 py-3 text-blue-400 font-medium whitespace-nowrap">{fmtHours(f.duration)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEditFlight(f)}
                            title="עריכה"
                            className="text-slate-400 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-blue-900/20"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmId(f.id)}
                            title="מחיקה"
                            className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PILOTS */}
        {activeTab === 'pilots' && (
          <div className="space-y-5">
            {/* Add button */}
            <div className="flex justify-end">
              <button
                onClick={() => setEditPilot('add')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                הוסף טייס חדש
              </button>
            </div>

            {/* Pilots table */}
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-700/50">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className="text-blue-400">👨‍✈️</span> רשימת טייסים ({db.pilots.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/30 text-right">
                      {['#', 'שם', 'רישיון', 'טיסות', 'סה"כ שעות', 'טיסה אחרונה', 'פעולות'].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-medium text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {db.pilots.map((p, i) => {
                      const pFlights = db.flights.filter(f => f.pilotId === p.id)
                      const totalMins = pFlights.reduce((a, f) => a + f.duration, 0)
                      const lastDate = pFlights.sort((a, b) => b.date.localeCompare(a.date))[0]?.date
                      const isAdmin = p.name === ADMIN_NAME
                      return (
                        <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-5 py-4 text-xs text-slate-500">{i + 1}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-700/40 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
                                {p.name[0]}
                              </div>
                              <div>
                                <span className="text-sm font-medium text-white">{p.name}</span>
                                {isAdmin && (
                                  <span className="mr-2 text-xs bg-blue-600/20 text-blue-400 border border-blue-700/40 px-1.5 py-0.5 rounded-full">מפקד</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-400 font-mono text-xs">{p.license}</td>
                          <td className="px-5 py-4 text-slate-300">{pFlights.length}</td>
                          <td className="px-5 py-4 text-blue-400 font-medium">{fmtHours(totalMins)}</td>
                          <td className="px-5 py-4 text-slate-400">
                            {lastDate ? new Date(lastDate).toLocaleDateString('he-IL') : '—'}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setEditPilot(p)}
                                title="עריכה"
                                className="text-slate-400 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-blue-900/20"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => { if (!isAdmin) setConfirmPilotId(p.id) }}
                                disabled={isAdmin}
                                title={isAdmin ? 'לא ניתן למחוק מפקד' : 'מחיקה'}
                                className={`p-1.5 rounded-lg transition-colors
                                  ${isAdmin ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-red-400 hover:bg-red-900/20'}`}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
