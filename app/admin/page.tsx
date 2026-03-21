'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FlightDB, Flight, Pilot, PilotStats, DroneInfo, DroneBattery, GasDrop, isFlightComplete, missingFields } from '@/lib/types'
import { DRONES, droneLabel } from '@/lib/drones'

const ADMIN_NAME = 'אורן וייסבלום'
const GAS_TAIL_NUMBERS = ['4x-xpg', '4x-ujs']
const BATTALIONS = ['גדוד אדומים', 'גדוד צפוני', 'גדוד דרומי', 'גדוד מודיעין', 'גדוד כללי']
const HEBREW_MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const MATRIX_MODELS = ['מאביק 2', 'מאביק 3', 'מאטריס 30', 'מאטריס 300', 'מאטריס 600', 'G3', 'אווטה']
function toMatrixModel(model: string): string | null {
  if (model === 'מאביק 2') return 'מאביק 2'
  if (model.startsWith('מאביק 3')) return 'מאביק 3'
  if (model === 'מאטריס 30') return 'מאטריס 30'
  if (model === 'מאטריס 300') return 'מאטריס 300'
  if (model === 'מאטריס 600') return 'מאטריס 600'
  if (model === 'G3') return 'G3'
  if (model.startsWith('אווטה')) return 'אווטה'
  return null
}
const TAIL_TO_MATRIX_MODEL: Record<string, string> = {}
DRONES.forEach(d => { const m = toMatrixModel(d.model); if (m) TAIL_TO_MATRIX_MODEL[d.tailNumber] = m })

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

// ── Excel export ───────────────────────────────────────────────────────────────
const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const MAX_FLIGHTS_PER_MISSION = 13

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}:00`
}

interface MissionData {
  dateStr: string; month: number; missionName: string; flights: Flight[]
  missionTotal: number; prevCumulative: number; cumulative: number
}

function groupMissions(flights: Flight[]): MissionData[] {
  const sorted = [...flights].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  const missionMap = new Map<string, { dateStr: string; missionName: string; flights: Flight[] }>()
  for (const f of sorted) {
    const key = `${f.date}||${f.missionName}`
    if (!missionMap.has(key)) missionMap.set(key, { dateStr: f.date, missionName: f.missionName, flights: [] })
    missionMap.get(key)!.flights.push(f)
  }
  let cumulative = 0
  return Array.from(missionMap.values()).map(({ dateStr, missionName, flights: mFlights }) => {
    const month = new Date(dateStr).getMonth()
    const missionTotal = mFlights.reduce((s: number, f: Flight) => s + f.duration, 0)
    const prev = cumulative
    cumulative += missionTotal
    return { dateStr, month, missionName, flights: mFlights, missionTotal, prevCumulative: prev, cumulative }
  })
}

function buildMissionSheet(missions: MissionData[], pilots: Pilot[], headerLabel: (m: MissionData) => string): (string | number)[][] {
  const pilotMap = new Map(pilots.map(p => [p.id, p]))
  const rows: (string | number)[][] = []
  for (const mission of missions) {
    const date = new Date(mission.dateStr).toLocaleDateString('he-IL')
    const uniquePilotIds = Array.from(new Set(mission.flights.map(f => f.pilotId)))
    const pilot1 = pilotMap.get(uniquePilotIds[0])
    const pilot2 = uniquePilotIds[1] ? pilotMap.get(uniquePilotIds[1]) : undefined
    const observer = mission.flights.find(f => f.observer)?.observer ?? ''
    const battalion = mission.flights.find(f => f.battalion)?.battalion ?? ''
    rows.push([headerLabel(mission), date, mission.missionName, battalion, pilot1?.name ?? '', pilot1?.license ?? '', pilot2?.name ?? '', pilot2?.license ?? '', observer])
    rows.push(['', 'שעת התחלה', 'שעת סיום', 'שם מטיס', 'רישוי מטיס', 'סוללה', "סה\"כ דק' טיסה"])
    for (let i = 0; i < MAX_FLIGHTS_PER_MISSION; i++) {
      const f = mission.flights[i]
      if (f) {
        const p = pilotMap.get(f.pilotId)
        rows.push([i + 1, f.startTime, f.endTime, f.pilotName, p?.license ?? '', f.battery, fmtDuration(f.duration)])
      } else {
        rows.push([i + 1, '', '', '', '', '', '0:00:00'])
      }
    }
    rows.push(["סה\"כ למשימה", '', '', '', '', '', fmtDuration(mission.missionTotal)])
    rows.push(["סיכום מדף קודם", '', '', '', '', '', fmtDuration(mission.prevCumulative)])
    rows.push(["סה\"כ מצטבר", '', '', '', '', '', fmtDuration(mission.cumulative)])
    rows.push(Array(7).fill(''))
  }
  return rows
}

async function downloadDroneExcel(flights: Flight[], pilots: Pilot[], tailNumber: string) {
  if (!flights.length) { alert('אין נתונים לייצוא'); return }
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const missions = groupMissions(flights)
  for (let m = 0; m < 12; m++) {
    const mm = missions.filter(x => x.month === m)
    if (!mm.length) continue
    const ws = XLSX.utils.aoa_to_sheet(buildMissionSheet(mm, pilots, () => tailNumber))
    ws['!cols'] = Array(7).fill({ wch: 16 })
    XLSX.utils.book_append_sheet(wb, ws, HEBREW_MONTHS[m])
  }
  if (!wb.SheetNames.length) { alert('אין נתונים לייצוא'); return }
  XLSX.writeFile(wb, `${tailNumber}_logbook.xlsx`)
}

async function downloadPilotExcel(flights: Flight[], pilots: Pilot[], pilotName: string) {
  if (!flights.length) { alert('אין נתונים לייצוא'); return }
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const missions = groupMissions(flights)
  for (let m = 0; m < 12; m++) {
    const mm = missions.filter(x => x.month === m)
    if (!mm.length) continue
    const ws = XLSX.utils.aoa_to_sheet(buildMissionSheet(mm, pilots, x => x.flights[0].tailNumber))
    ws['!cols'] = Array(7).fill({ wch: 16 })
    XLSX.utils.book_append_sheet(wb, ws, HEBREW_MONTHS[m])
  }
  if (!wb.SheetNames.length) { alert('אין נתונים לייצוא'); return }
  XLSX.writeFile(wb, `${pilotName}_logbook.xlsx`)
}

async function downloadGeneralExcel(flights: Flight[], pilots: Pilot[], gasDrops: GasDrop[] = []) {
  if (!flights.length) { alert('אין נתונים לייצוא'); return }
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const seenModels = new Set<string>()
  for (const drone of DRONES) {
    if (seenModels.has(drone.model)) continue
    seenModels.add(drone.model)
    const tails = DRONES.filter(d => d.model === drone.model).map(d => d.tailNumber)
    const mf = flights.filter(f => tails.includes(f.tailNumber))
    if (!mf.length) continue
    const ws = XLSX.utils.aoa_to_sheet(buildMissionSheet(groupMissions(mf), pilots, x => x.flights[0].tailNumber))
    ws['!cols'] = Array(7).fill({ wch: 16 })
    XLSX.utils.book_append_sheet(wb, ws, drone.model)
  }
  // Combine gas drops from flights (gas_dropped=true) + standalone gas_drops table
  const gasFromFlights = [...flights].filter(f => f.gasDropped).map(f => ({
    date: f.date, tailNumber: f.tailNumber, missionName: f.missionName, pilotName: f.pilotName, eventNumber: f.eventNumber ?? ''
  }))
  const gasStandalone = gasDrops.map(g => ({
    date: g.date, tailNumber: g.tailNumber, missionName: '—', pilotName: g.pilotName, eventNumber: g.gasDropTime ?? ''
  }))
  const allGasRows = [...gasFromFlights, ...gasStandalone].sort((a, b) => a.date.localeCompare(b.date))
  if (allGasRows.length) {
    const gasRows: (string | number)[][] = [["תאריך", "מס' זנב", "משימה", "שם מטיס", "מספר אירוע"]]
    for (const r of allGasRows) gasRows.push([new Date(r.date).toLocaleDateString('he-IL'), r.tailNumber, r.missionName, r.pilotName, r.eventNumber])
    const ws = XLSX.utils.aoa_to_sheet(gasRows)
    ws['!cols'] = Array(5).fill({ wch: 18 })
    XLSX.utils.book_append_sheet(wb, ws, 'הטלות גז')
  }
  const practiceFlights = flights.filter(f => f.missionName.includes('תרגול'))
  if (practiceFlights.length) {
    const ws = XLSX.utils.aoa_to_sheet(buildMissionSheet(groupMissions(practiceFlights), pilots, x => x.flights[0].tailNumber))
    ws['!cols'] = Array(7).fill({ wch: 16 })
    XLSX.utils.book_append_sheet(wb, ws, 'תרגול חודשי')
  }
  if (!wb.SheetNames.length) { alert('אין נתונים לייצוא'); return }
  XLSX.writeFile(wb, 'logbook_general.xlsx')
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
  battery: string; startTime: string; endTime: string
  observer: string; gasDropped: boolean; eventNumber: string; battalion: string
}

function EditModal({ flight, db, onSave, onCancel, drones, batteries }: {
  flight: Flight
  db: FlightDB
  onSave: (updated: EditForm) => void
  onCancel: () => void
  drones?: DroneInfo[]
  batteries?: DroneBattery[]
}) {
  const [form, setForm] = useState<EditForm>({
    pilotId:     flight.pilotId,
    date:        flight.date,
    missionName: flight.missionName,
    tailNumber:  flight.tailNumber,
    battery:     flight.battery,
    startTime:   flight.startTime,
    endTime:     flight.endTime,
    observer:    flight.observer    ?? '',
    gasDropped:  flight.gasDropped  ?? false,
    eventNumber: flight.eventNumber ?? '',
    battalion:   flight.battalion   ?? '',
  })
  const [error, setError] = useState('')

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  const durationPreview = form.startTime && form.endTime ? calcDuration(form.startTime, form.endTime) : null
  const availableBatteries = (batteries ?? []).filter(b => b.droneTailNumber === form.tailNumber)
  const noBatteries = availableBatteries.length === 0

  const handleSave = () => {
    const { date, pilotId } = form
    if (!date || !pilotId) { setError('טייס ותאריך הם שדות חובה'); return }
    if (form.startTime && form.endTime) {
      const dur = calcDuration(form.startTime, form.endTime)
      if (dur <= 0) { setError('שעת סיום חייבת להיות לאחר שעת התחלה'); return }
    }
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
            <select value={form.tailNumber}
              onChange={e => setForm(f => {
                const newTail = e.target.value
                const batsForNew = (batteries ?? []).filter(b => b.droneTailNumber === newTail)
                const keepBattery = batsForNew.some(b => b.batteryName === f.battery)
                return { ...f, tailNumber: newTail, battery: keepBattery ? f.battery : '' }
              })}
              className={inputCls}>
              {(drones ?? DRONES).map(d => <option key={d.tailNumber} value={d.tailNumber}>{d.model} | {d.tailNumber}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>סוללה</label>
            {noBatteries ? (
              <select disabled className={`${inputCls} opacity-50 cursor-not-allowed`}>
                <option>אין סוללות רשומות לרחפן זה</option>
              </select>
            ) : (
              <select value={form.battery} onChange={e => setForm(f => ({ ...f, battery: e.target.value }))} className={inputCls}>
                <option value="">— בחר סוללה —</option>
                {availableBatteries.map(b => <option key={b.id} value={b.batteryName}>{b.batteryName}</option>)}
              </select>
            )}
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
            <label className={labelCls}>תצפיתן (אופציונלי)</label>
            <input type="text" value={form.observer}
              onChange={e => setForm(f => ({ ...f, observer: e.target.value }))}
              placeholder="שם התצפיתן..." className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>גדוד (אופציונלי)</label>
            <select value={form.battalion} onChange={e => setForm(f => ({ ...f, battalion: e.target.value }))} className={inputCls}>
              <option value="">— בחר גדוד —</option>
              {BATTALIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {(form.tailNumber === '4x-ujs' || form.tailNumber === '4x-xpg') && (
            <div className="sm:col-span-2 bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-3">הטלת גז</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.gasDropped}
                  onChange={e => setForm(f => ({ ...f, gasDropped: e.target.checked, eventNumber: e.target.checked ? f.eventNumber : '' }))}
                  className="w-4 h-4 accent-amber-500" />
                <span className="text-sm text-amber-200">בוצעה הטלת גז?</span>
              </label>
              {form.gasDropped && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-amber-400/80 mb-1.5">מספר אירוע</label>
                  <input type="text" value={form.eventNumber}
                    onChange={e => setForm(f => ({ ...f, eventNumber: e.target.value }))}
                    placeholder="מס׳ אירוע..." className={inputCls} />
                </div>
              )}
            </div>
          )}
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

// ── Drone edit modal ──────────────────────────────────────────────────────────
function DroneEditModal({ drone, onSave, onCancel }: {
  drone: DroneInfo | null  // null = add new
  onSave: (d: DroneInfo) => void
  onCancel: () => void
}) {
  const isNew = drone === null
  const [form, setForm] = useState({
    tailNumber:        drone?.tailNumber ?? '',
    model:             drone?.model ?? '',
    weightKg:          drone?.weightKg != null ? String(drone.weightKg) : '',
    serialNumber:      drone?.serialNumber ?? '',
    extraRegistration: drone?.extraRegistration ?? '',
  })
  const cls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const handleSave = () => {
    if (!form.tailNumber.trim() || !form.model.trim()) {
      alert('דגם ומספר זנב הם שדות חובה'); return
    }
    onSave({
      tailNumber: form.tailNumber.trim(),
      model: form.model.trim(),
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      serialNumber: form.serialNumber.trim(),
      extraRegistration: form.extraRegistration.trim() || null,
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-600/60 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-5">
          {isNew ? '🚁 הוספת רחפן חדש' : <>עריכת רחפן — <span className="font-mono text-blue-400">{drone!.tailNumber}</span></>}
        </h3>
        <div className="space-y-4">
          {isNew && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">מספר זנב <span className="text-red-400">*</span></label>
              <input value={form.tailNumber} onChange={e => setForm(p => ({ ...p, tailNumber: e.target.value }))} placeholder="למשל: 4x-abc" className={`${cls} font-mono`} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">דגם <span className="text-red-400">*</span></label>
            <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder="למשל: מאביק 4" className={cls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">משקל (ק&quot;ג)</label>
            <input value={form.weightKg} onChange={e => setForm(p => ({ ...p, weightKg: e.target.value }))} type="number" placeholder="למשל: 4" className={cls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">מס&apos; סידורי (S.N)</label>
            <input value={form.serialNumber} onChange={e => setForm(p => ({ ...p, serialNumber: e.target.value }))} className={`${cls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">רישום נוסף</label>
            <input value={form.extraRegistration} onChange={e => setForm(p => ({ ...p, extraRegistration: e.target.value }))} className={cls} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">ביטול</button>
          <button onClick={handleSave} className={`flex-1 px-4 py-2.5 text-sm text-white rounded-xl transition-all font-medium ${isNew ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {isNew ? 'הוסף רחפן' : 'שמור שינויים'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Battery edit / add modal ───────────────────────────────────────────────────
function BatteryModal({ battery, tailNumber, drones, onSave, onCancel }: {
  battery: DroneBattery | null
  tailNumber: string
  drones?: DroneInfo[]
  onSave: (b: Partial<DroneBattery> & { droneTailNumber: string }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    droneTailNumber: battery?.droneTailNumber ?? tailNumber,
    batteryName:    battery?.batteryName ?? '',
    chargeCycle:    battery?.chargeCycle ?? '',
    inspectionDate: battery?.inspectionDate ?? '',
  })
  const cls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const showDroneSelect = !tailNumber && drones && drones.length > 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-600/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-5">{battery ? 'עריכת סוללה' : 'הוספת סוללה'}</h3>
        <div className="space-y-4">
          {showDroneSelect && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">רחפן</label>
              <select value={form.droneTailNumber} onChange={e => setForm(p => ({ ...p, droneTailNumber: e.target.value }))} className={cls}>
                <option value="">בחר רחפן...</option>
                {drones!.map(d => <option key={d.tailNumber} value={d.tailNumber}>{d.model} | {d.tailNumber}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">שם סוללה</label>
            <input value={form.batteryName} onChange={e => setForm(p => ({ ...p, batteryName: e.target.value }))} placeholder="למשל: סט 1" className={cls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">מחזור (סוללה 1 - סוללה 2)</label>
            <input value={form.chargeCycle} onChange={e => setForm(p => ({ ...p, chargeCycle: e.target.value }))} placeholder="287-282" className={cls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">תאריך בדיקה</label>
            <input value={form.inspectionDate} onChange={e => setForm(p => ({ ...p, inspectionDate: e.target.value }))} placeholder="16.4.25" className={cls} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">ביטול</button>
          <button
            onClick={() => {
              if (!form.batteryName.trim()) { alert('יש להזין שם סוללה'); return }
              if (!form.droneTailNumber) { alert('יש לבחור רחפן'); return }
              onSave({ id: battery?.id, droneTailNumber: form.droneTailNumber, batteryName: form.batteryName.trim(), chargeCycle: form.chargeCycle, inspectionDate: form.inspectionDate })
            }}
            className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all font-medium">
            {battery ? 'שמור' : 'הוסף'}
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
  const [activeTab, setActiveTab] = useState<'overview' | 'ranking' | 'add' | 'history' | 'pilots' | 'batteries' | 'drones'>('overview')
  const [addForm, setAddForm] = useState({
    pilotId: '', date: '', missionName: '', tailNumber: '4x-pzk',
    battery: '', startTime: '', endTime: '',
    observer: '', gasDropped: false, eventNumber: '', battalion: '',
  })
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [expandedPilot, setExpandedPilot] = useState<string | null>(null)
  const [expandedDroneCard, setExpandedDroneCard] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ pilotId: string; model: string; type: 'ever' | 'monthly' } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmPilotId, setConfirmPilotId] = useState<string | null>(null)
  const [editFlight, setEditFlight] = useState<Flight | null>(null)
  const [editPilot, setEditPilot] = useState<Pilot | 'add' | null>(null)
  const [droneDetails, setDroneDetails] = useState<DroneInfo[]>([])
  const [droneBatteries, setDroneBatteries] = useState<DroneBattery[]>([])
  const [expandedDrone, setExpandedDrone] = useState<string | null>(null)
  const [editDroneModal, setEditDroneModal] = useState<DroneInfo | 'new' | null>(null)
  const [confirmDeleteDroneId, setConfirmDeleteDroneId] = useState<string | null>(null)
  const [batteryModal, setBatteryModal] = useState<{ battery: DroneBattery | null; tailNumber: string } | null>(null)
  const [confirmBatteryId, setConfirmBatteryId] = useState<string | null>(null)
  const [gasDrops, setGasDrops] = useState<GasDrop[]>([])
  const [gasDropMigrating, setGasDropMigrating] = useState(false)

  useEffect(() => {
    const user = sessionStorage.getItem('currentUser')
    if (user !== ADMIN_NAME) router.replace('/')
  }, [router])

  const fetchDB = useCallback(async () => {
    const res = await fetch('/api/flights', { cache: 'no-store' })
    setDb(await res.json())
  }, [])

  const fetchDroneData = useCallback(async () => {
    const [dronesRes, batteriesRes] = await Promise.all([
      fetch('/api/drones', { cache: 'no-store' }),
      fetch('/api/drone-batteries', { cache: 'no-store' }),
    ])
    if (dronesRes.ok) setDroneDetails(await dronesRes.json())
    if (batteriesRes.ok) setDroneBatteries(await batteriesRes.json())
  }, [])

  const fetchGasDrops = useCallback(async () => {
    const res = await fetch('/api/gas-drops', { cache: 'no-store' })
    if (res.ok) setGasDrops(await res.json())
  }, [])

  useEffect(() => { fetchDB() }, [fetchDB])
  useEffect(() => { fetchDroneData() }, [fetchDroneData])
  useEffect(() => { fetchGasDrops() }, [fetchGasDrops])

  if (!db) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Stats
  const now = new Date()
  const thisYear = String(now.getFullYear())
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totalMinutes = db.flights.reduce((a, f) => a + f.duration, 0)
  const missionsThisMonth = db.flights.filter(f => f.date.startsWith(thisMonth)).length
  const missionsThisYear  = db.flights.filter(f => f.date.startsWith(thisYear)).length

  // Battalion breakdown (all-time)
  const battalionCounts: Record<string, number> = {}
  BATTALIONS.forEach(b => { battalionCounts[b] = 0 })
  db.flights.forEach(f => { if (f.battalion && battalionCounts[f.battalion] !== undefined) battalionCounts[f.battalion]++ })
  const maxBattalionCount = Math.max(...Object.values(battalionCounts), 1)

  // Drone minutes YTD + monthly breakdown
  const droneYTDMins: Record<string, number> = {}
  const droneMonthlyMins: Record<string, Record<string, number>> = {}
  // drone → month → pilotName → minutes
  const droneMonthlyPilotMins: Record<string, Record<string, Record<string, number>>> = {}
  db.flights.forEach(f => {
    if (!f.date.startsWith(thisYear)) return
    droneYTDMins[f.tailNumber] = (droneYTDMins[f.tailNumber] || 0) + f.duration
    const month = f.date.slice(0, 7)
    if (!droneMonthlyMins[f.tailNumber]) droneMonthlyMins[f.tailNumber] = {}
    if (!droneMonthlyPilotMins[f.tailNumber]) droneMonthlyPilotMins[f.tailNumber] = {}
    droneMonthlyMins[f.tailNumber][month] = (droneMonthlyMins[f.tailNumber][month] || 0) + f.duration
    if (!droneMonthlyPilotMins[f.tailNumber][month]) droneMonthlyPilotMins[f.tailNumber][month] = {}
    const pm = droneMonthlyPilotMins[f.tailNumber][month]
    pm[f.pilotName] = (pm[f.pilotName] || 0) + f.duration
  })

  // Pilot month + YTD minutes
  const pilotMonthMins: Record<string, number> = {}
  const pilotYTDMins: Record<string, number> = {}
  db.flights.forEach(f => {
    if (f.date.startsWith(thisMonth)) pilotMonthMins[f.pilotId] = (pilotMonthMins[f.pilotId] || 0) + f.duration
    if (f.date.startsWith(thisYear))  pilotYTDMins[f.pilotId]   = (pilotYTDMins[f.pilotId]   || 0) + f.duration
  })

  const pilotStats: PilotStats[] = db.pilots.map(pilot => {
    const pFlights = db.flights.filter(f => f.pilotId === pilot.id)
    const totalMins = pFlights.reduce((a, f) => a + f.duration, 0)
    const sorted = [...pFlights].sort((a, b) => b.date.localeCompare(a.date))
    return { pilot, totalMinutes: totalMins, totalFlights: pFlights.length, lastFlightDate: sorted[0]?.date ?? '—', lastDuration: sorted[0]?.duration ?? 0 }
  }).sort((a, b) => b.totalMinutes - a.totalMinutes)
  const maxMinutes = pilotStats[0]?.totalMinutes ?? 1

  // Drone total minutes per tail
  const droneTotalMins: Record<string, number> = {}
  db.flights.forEach(f => { droneTotalMins[f.tailNumber] = (droneTotalMins[f.tailNumber] || 0) + f.duration })

  // Pilot training matrix
  const pilotEverFlew: Record<string, Set<string>> = {}
  const pilotMonthlyFlew: Record<string, Set<string>> = {}
  db.pilots.forEach(p => { pilotEverFlew[p.id] = new Set(); pilotMonthlyFlew[p.id] = new Set() })
  db.flights.forEach(f => {
    const model = TAIL_TO_MATRIX_MODEL[f.tailNumber]
    if (!model) return
    if (pilotEverFlew[f.pilotId]) pilotEverFlew[f.pilotId].add(model)
    if (f.date.startsWith(thisMonth) && pilotMonthlyFlew[f.pilotId]) pilotMonthlyFlew[f.pilotId].add(model)
  })

  // Last date each pilot flew each model (all-time & this month)
  const pilotLastFlewModel: Record<string, Record<string, string>> = {}
  const pilotLastMonthFlewModel: Record<string, Record<string, string>> = {}
  db.pilots.forEach(p => { pilotLastFlewModel[p.id] = {}; pilotLastMonthFlewModel[p.id] = {} })
  db.flights.forEach(f => {
    const model = TAIL_TO_MATRIX_MODEL[f.tailNumber]
    if (!model) return
    if (pilotLastFlewModel[f.pilotId]) {
      const cur = pilotLastFlewModel[f.pilotId][model]
      if (!cur || f.date > cur) pilotLastFlewModel[f.pilotId][model] = f.date
    }
    if (f.date.startsWith(thisMonth) && pilotLastMonthFlewModel[f.pilotId]) {
      const cur = pilotLastMonthFlewModel[f.pilotId][model]
      if (!cur || f.date > cur) pilotLastMonthFlewModel[f.pilotId][model] = f.date
    }
  })
  const maxDroneMins = Math.max(...DRONES.map(d => droneTotalMins[d.tailNumber] ?? 0), 1)
  const dronesForSelect: DroneInfo[] = droneDetails.length > 0
    ? droneDetails
    : DRONES.map(d => ({ tailNumber: d.tailNumber, model: d.model, weightKg: d.weightKg ?? null, serialNumber: d.serialNumber ?? '', extraRegistration: d.extraReg ?? null }))


  const handleAddFlight = async () => {
    setAddError(''); setAddSuccess('')
    const { pilotId, date, startTime, endTime } = addForm
    if (!pilotId || !date) { setAddError('טייס ותאריך הם שדות חובה'); return }
    if (startTime && endTime) {
      const dur = calcDuration(startTime, endTime)
      if (dur <= 0) { setAddError('שעת סיום חייבת להיות לאחר שעת התחלה'); return }
    }
    const pilot = db.pilots.find(p => p.id === pilotId)!
    const duration = startTime && endTime ? calcDuration(startTime, endTime) : 0
    const res = await fetch('/api/flights', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pilotId, pilotName: pilot.name, date,
        missionName: addForm.missionName, tailNumber: addForm.tailNumber, battery: addForm.battery,
        startTime, endTime, duration,
        observer: addForm.observer, gasDropped: addForm.gasDropped, eventNumber: addForm.eventNumber,
        battalion: addForm.battalion,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setAddError(err.error === 'DB_MIGRATION_NEEDED' ? 'נדרש עדכון DB — ראה חלונית האזהרה בראש הדף' : (err.error ?? `שגיאה בשמירה (${res.status})`)); return
    }
    setAddSuccess(`טיסה נוספה בהצלחה עבור ${pilot.name}`)
    setAddForm({ pilotId: '', date: '', missionName: '', tailNumber: '4x-pzk', battery: '', startTime: '', endTime: '', observer: '', gasDropped: false, eventNumber: '', battalion: '' })
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
    const duration = form.startTime && form.endTime ? calcDuration(form.startTime, form.endTime) : 0
    await fetch('/api/flights', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editFlight.id, pilotId: form.pilotId, pilotName: pilot.name,
        date: form.date, missionName: form.missionName, tailNumber: form.tailNumber,
        battery: form.battery, startTime: form.startTime, endTime: form.endTime, duration,
        observer: form.observer, gasDropped: form.gasDropped, eventNumber: form.eventNumber,
        battalion: form.battalion,
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

  const handleEditDrone = async (drone: DroneInfo) => {
    const res = await fetch('/api/drones', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(drone) })
    if (!res.ok) { alert('שגיאה בעדכון רחפן'); return }
    setEditDroneModal(null)
    fetchDroneData()
  }

  const handleAddDrone = async (drone: DroneInfo) => {
    const res = await fetch('/api/drones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(drone) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error === 'DUPLICATE' ? 'רחפן עם מספר זנב זה כבר קיים במערכת' : 'שגיאה בהוספת רחפן')
      return
    }
    setEditDroneModal(null)
    fetchDroneData()
  }

  const handleDeleteDrone = async (tailNumber: string) => {
    const res = await fetch(`/api/drones?tailNumber=${encodeURIComponent(tailNumber)}`, { method: 'DELETE' })
    if (!res.ok) { alert('שגיאה במחיקת רחפן'); return }
    setConfirmDeleteDroneId(null)
    fetchDroneData()
  }

  const handleSaveBattery = async (b: Partial<DroneBattery> & { droneTailNumber: string }) => {
    const method = b.id ? 'PUT' : 'POST'
    const res = await fetch('/api/drone-batteries', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    if (!res.ok) { alert(b.id ? 'שגיאה בעדכון סוללה' : 'שגיאה בהוספת סוללה'); return }
    setBatteryModal(null)
    fetchDroneData()
  }

  const handleDeleteBattery = async (id: string) => {
    const res = await fetch(`/api/drone-batteries?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('שגיאה במחיקת סוללה'); return }
    setConfirmBatteryId(null)
    fetchDroneData()
  }

  const handleMarkGasDrops = async () => {
    setGasDropMigrating(true)
    const res = await fetch('/api/admin/mark-gas-drops', { method: 'POST' })
    setGasDropMigrating(false)
    if (!res.ok) { alert('שגיאה בעדכון הטלות גז'); return }
    const { summary } = await res.json()
    alert(`עדכון הטלות גז:\n✅ ${summary.updated} טיסות עודכנו\n➕ ${summary.added} רשומות עצמאיות נוספו\n⏭ ${summary.skipped} כבר קיימות\n❌ ${summary.errors} שגיאות`)
    fetchDB()
    fetchGasDrops()
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
          drones={dronesForSelect}
          batteries={droneBatteries}
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
      {editDroneModal !== null && (
        <DroneEditModal
          drone={editDroneModal === 'new' ? null : editDroneModal}
          onSave={editDroneModal === 'new' ? handleAddDrone : handleEditDrone}
          onCancel={() => setEditDroneModal(null)}
        />
      )}
      {confirmDeleteDroneId && (
        <ConfirmDialog
          message={`מחיקת רחפן ${confirmDeleteDroneId} תסיר אותו מהמערכת. היסטוריית הטיסות שלו תישמר.`}
          onConfirm={() => handleDeleteDrone(confirmDeleteDroneId)}
          onCancel={() => setConfirmDeleteDroneId(null)}
        />
      )}
      {batteryModal && (
        <BatteryModal battery={batteryModal.battery} tailNumber={batteryModal.tailNumber} drones={dronesForSelect} onSave={handleSaveBattery} onCancel={() => setBatteryModal(null)} />
      )}
      {confirmBatteryId && (
        <ConfirmDialog
          message="פעולה זו תמחק את רשומת הסוללה לצמיתות."
          onConfirm={() => handleDeleteBattery(confirmBatteryId)}
          onCancel={() => setConfirmBatteryId(null)}
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

        {/* ── Migration warning ─────────────────────────────────────────── */}
        {db.migrationNeeded && (
          <div className="bg-red-900/30 border-2 border-red-500/60 rounded-xl p-5 text-right" dir="rtl">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <p className="text-red-300 font-bold text-base mb-1">נדרש עדכון בסיס נתונים</p>
                <p className="text-red-400/90 text-sm mb-3">
                  עמודות observer / gas_dropped / gas_drop_time חסרות בטבלת flights.
                  שדות תצפיתן והטלת גז <strong>לא יישמרו</strong> עד להרצת ה-SQL הבא ב-Supabase.
                </p>
                <p className="text-xs text-slate-400 mb-2">
                  פתח את{' '}
                  <a
                    href={`https://supabase.com/dashboard/project/${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/\/\/([^.]+)/)?.[1] ?? '_'}/sql`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline"
                  >
                    Supabase SQL Editor
                  </a>
                  , הדבק את ה-SQL הבא ולחץ Run:
                </p>
                <pre className="bg-slate-900/70 border border-slate-700 rounded-lg p-3 text-xs text-green-300 text-left font-mono whitespace-pre-wrap select-all">
{`ALTER TABLE flights ADD COLUMN IF NOT EXISTS observer TEXT DEFAULT '';
ALTER TABLE flights ADD COLUMN IF NOT EXISTS gas_dropped BOOLEAN DEFAULT FALSE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS gas_drop_time TEXT DEFAULT NULL;`}
                </pre>
                <p className="text-xs text-slate-500 mt-2">לאחר הרצת ה-SQL, רענן את הדף.</p>
              </div>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'סה"כ שעות טיסה', value: fmtHours(totalMinutes), icon: '🕐' },
            { label: 'טייסים פעילים', value: db.pilots.length, icon: '👨‍✈️' },
            { label: 'משימות החודש', value: missionsThisMonth, icon: '📋' },
            { label: 'משימות מתחילת השנה', value: missionsThisYear, icon: '📅' },
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

        {/* Battalion breakdown card */}
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-3">התפלגות משימות לפי גדוד</p>
          <div className="space-y-2" dir="rtl">
            {BATTALIONS.map(bn => {
              const count = battalionCounts[bn] ?? 0
              const pct = maxBattalionCount > 0 ? (count / maxBattalionCount) * 100 : 0
              return (
                <div key={bn} className="flex items-center gap-3">
                  <span className="text-xs text-slate-300 w-28 shrink-0 text-right">{bn}</span>
                  <div className="flex-1 h-4 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-blue-400 w-6 text-left shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 overflow-x-auto">
          {([
            { key: 'overview',   label: 'סקירה',          icon: '📊' },
            { key: 'ranking',    label: 'דירוג טייסים',    icon: '🏆' },
            { key: 'add',        label: 'הוספת טיסה',      icon: '➕' },
            { key: 'history',    label: 'היסטוריה',        icon: '📜' },
            { key: 'pilots',     label: 'ניהול טייסים',    icon: '👨‍✈️' },
            { key: 'batteries',  label: 'ניהול סוללות',    icon: '🔋' },
            { key: 'drones',     label: 'ניהול רחפנים',    icon: '🚁' },
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
          <div className="space-y-6" onClick={() => setTooltip(null)}>
            <div className="flex gap-2 justify-end flex-wrap">
              <button
                onClick={handleMarkGasDrops}
                disabled={gasDropMigrating}
                className="flex items-center gap-2 bg-orange-700/80 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-orange-600/50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {gasDropMigrating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🔥'}
                סמן הטלות גז היסטוריות
              </button>
              <button
                onClick={() => downloadGeneralExcel(db.flights, db.pilots, gasDrops)}
                className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-emerald-600/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                ייצוא כללי לאקסל ({db.flights.length} טיסות)
              </button>
            </div>

            {/* ── Section 1: Drone Summary ────────────────────────────────── */}
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl">
              <div className="p-5 border-b border-slate-700/50">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>🚁</span> סיכום רחפנים
                </h2>
              </div>

              {/* Mobile + desktop: unified clickable cards */}
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" dir="rtl">
                {DRONES.map(drone => {
                  const ytdMins = droneYTDMins[drone.tailNumber] ?? 0
                  const maxYTD = Math.max(...DRONES.map(d => droneYTDMins[d.tailNumber] ?? 0), 1)
                  const pct = ytdMins / maxYTD
                  const isGas = GAS_TAIL_NUMBERS.includes(drone.tailNumber)
                  const lastGasDrop = isGas
                    ? gasDrops.filter(g => g.tailNumber === drone.tailNumber).sort((a, b) => b.date.localeCompare(a.date))[0]
                    : null
                  const barColor = pct > 0.66 ? 'from-cyan-500 to-blue-400' : pct > 0.33 ? 'from-blue-500 to-blue-600' : pct > 0 ? 'from-blue-700 to-slate-500' : 'from-slate-700 to-slate-600'
                  const hoursColor = pct > 0.66 ? 'text-cyan-400' : pct > 0.33 ? 'text-blue-400' : pct > 0 ? 'text-blue-500' : 'text-slate-500'
                  const borderColor = pct > 0.66 ? 'border-cyan-500/30' : pct > 0.33 ? 'border-blue-500/30' : pct > 0 ? 'border-blue-800/30' : 'border-slate-600/30'
                  const isOpen = expandedDroneCard === drone.tailNumber
                  const monthlyData = Object.entries(droneMonthlyMins[drone.tailNumber] ?? {}).sort()
                  return (
                    <div key={drone.tailNumber} className="col-span-1">
                      <button
                        onClick={() => setExpandedDroneCard(isOpen ? null : drone.tailNumber)}
                        className={`w-full text-right bg-slate-700/40 border ${isOpen ? 'border-blue-500/50 bg-slate-700/60' : borderColor} rounded-xl p-4 transition-all active:scale-95`}
                      >
                        <p className="text-xs font-semibold text-white mb-0.5 leading-tight">{drone.model}</p>
                        <p className="text-[10px] font-mono text-slate-500 mb-3">{drone.tailNumber}</p>
                        <div className="h-1.5 bg-slate-600/50 rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full bg-gradient-to-l ${barColor} rounded-full transition-all duration-700`}
                            style={{ width: `${ytdMins > 0 ? Math.max(pct * 100, 5) : 0}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 mb-0.5">מתחילת השנה</p>
                        <p className={`text-base font-bold ${hoursColor}`}>{ytdMins ? fmtHours(ytdMins) : '—'}</p>
                        {isGas && (
                          <div className="mt-2 pt-2 border-t border-slate-600/40">
                            <p className="text-[10px] text-slate-400">הטלה אחרונה</p>
                            <p className={`text-xs font-semibold ${lastGasDrop ? 'text-green-400' : 'text-slate-500'}`}>
                              {lastGasDrop ? new Date(lastGasDrop.date).toLocaleDateString('he-IL') : '—'}
                            </p>
                          </div>
                        )}
                      </button>
                      {/* Expandable monthly breakdown */}
                      <div
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{ maxHeight: isOpen ? '1200px' : '0px', opacity: isOpen ? 1 : 0 }}
                      >
                        <div className="mt-2 bg-slate-900/60 border border-slate-700/40 rounded-xl p-4" dir="rtl">
                          <p className="text-xs font-semibold text-slate-300 mb-3">פירוט חודשי — {thisYear}</p>
                          {monthlyData.length === 0 ? (
                            <p className="text-sm text-slate-600">אין טיסות השנה</p>
                          ) : (
                            <div className="space-y-4">
                              {monthlyData.map(([month, totalMins]) => {
                                const monthIdx = parseInt(month.slice(5, 7)) - 1
                                const pilotMins = droneMonthlyPilotMins[drone.tailNumber]?.[month] ?? {}
                                const pilotEntries = Object.entries(pilotMins).sort((a, b) => b[1] - a[1])
                                return (
                                  <div key={month} className="bg-slate-800/50 rounded-lg p-3">
                                    <p className="text-xs font-bold text-white mb-2">{HEBREW_MONTH_NAMES[monthIdx]}</p>
                                    <div className="space-y-1.5 mb-2">
                                      {pilotEntries.map(([pilotName, mins]) => (
                                        <div key={pilotName} className="flex items-center justify-between">
                                          <span className="text-xs text-slate-400">— {pilotName}</span>
                                          <span className="text-xs font-medium text-blue-300">{fmtHours(mins)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="border-t border-slate-700/50 pt-1.5 flex items-center justify-between">
                                      <span className="text-xs text-slate-500">סה&quot;כ {HEBREW_MONTH_NAMES[monthIdx]}</span>
                                      <span className="text-xs font-bold text-blue-400">{fmtHours(totalMins)}</span>
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="border-t border-slate-600/50 pt-2 flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-200">סה&quot;כ שנה</span>
                                <span className="text-sm font-bold text-cyan-400">{fmtHours(ytdMins)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>

            {/* ── Section 2: Pilot Training Matrix ───────────────────────── */}
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl">
              <div className="p-5 border-b border-slate-700/50">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>🎓</span> סיכום אימוני טייסים
                </h2>
              </div>

              {/* Mobile: expandable pilot cards */}
              <div className="sm:hidden divide-y divide-slate-700/30" dir="rtl">
                {db.pilots.map(pilot => {
                  const isExpanded = expandedPilot === pilot.id
                  const monthlyCount = MATRIX_MODELS.filter(m => pilotMonthlyFlew[pilot.id]?.has(m)).length
                  return (
                    <div key={pilot.id}>
                      {/* Pilot header row */}
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedPilot(isExpanded ? null : pilot.id); setTooltip(null) }}
                        className="w-full px-5 py-4 flex items-center justify-between active:bg-slate-700/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-700/40 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
                            {pilot.name[0]}
                          </div>
                          <span className="font-medium text-white text-sm">{pilot.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            monthlyCount === MATRIX_MODELS.length ? 'bg-green-900/50 text-green-400 border border-green-700/40'
                            : monthlyCount > 0 ? 'bg-amber-900/50 text-amber-400 border border-amber-700/40'
                            : 'bg-red-900/50 text-red-400 border border-red-700/40'
                          }`}>
                            {monthlyCount}/{MATRIX_MODELS.length} החודש
                          </span>
                          <svg
                            className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expandable content */}
                      <div
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{ maxHeight: isExpanded ? '800px' : '0px', opacity: isExpanded ? 1 : 0 }}
                      >
                        <div className="px-4 pb-5 space-y-4">

                          {/* Info bar — shows tooltip details */}
                          {tooltip?.pilotId === pilot.id && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs animate-in fade-in duration-150 ${
                              tooltip.type === 'monthly'
                                ? 'bg-amber-900/30 border border-amber-700/40 text-amber-100'
                                : 'bg-slate-700/60 border border-slate-600/40 text-slate-100'
                            }`}>
                              <span className="font-semibold shrink-0">{tooltip.model}</span>
                              <span className="text-slate-400">·</span>
                              <span className="flex-1">
                                {tooltip.type === 'ever'
                                  ? (pilotEverFlew[pilot.id]?.has(tooltip.model)
                                    ? `אימון אחרון: ${new Date(pilotLastFlewModel[pilot.id]?.[tooltip.model]).toLocaleDateString('he-IL')}`
                                    : 'לא בוצע אימון מעולם')
                                  : (pilotMonthlyFlew[pilot.id]?.has(tooltip.model)
                                    ? `בוצע ב‑${new Date(pilotLastMonthFlewModel[pilot.id]?.[tooltip.model]).toLocaleDateString('he-IL')}`
                                    : 'לא בוצע אימון החודש')}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); setTooltip(null) }}
                                className="text-slate-400 hover:text-white transition-colors shrink-0 text-base leading-none"
                              >✕</button>
                            </div>
                          )}

                          {/* כשירות כללית */}
                          <div>
                            <p className="text-xs font-medium text-slate-400 mb-3">כשירות כללית</p>
                            <div className="flex flex-wrap gap-3">
                              {MATRIX_MODELS.map(model => {
                                const flew = pilotEverFlew[pilot.id]?.has(model)
                                const isActive = tooltip?.pilotId === pilot.id && tooltip?.model === model && tooltip?.type === 'ever'
                                return (
                                  <button
                                    key={model}
                                    onClick={e => { e.stopPropagation(); setTooltip(isActive ? null : { pilotId: pilot.id, model, type: 'ever' }) }}
                                    className="flex flex-col items-center gap-1.5 transition-transform active:scale-90"
                                  >
                                    <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all ${
                                      flew ? 'bg-green-500/20 border-green-500' : 'bg-red-500/10 border-red-500/60'
                                    } ${isActive ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-white/40 scale-110' : ''}`}>
                                      <span className={`w-5 h-5 rounded-full ${flew ? 'bg-green-500' : 'bg-red-500/70'}`} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 text-center w-12 leading-tight">{model}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* אימון חודשי */}
                          <div className="bg-amber-900/10 rounded-xl p-4 border border-amber-600/20">
                            <p className="text-xs font-medium text-amber-400/90 mb-3">אימון חודשי</p>
                            <div className="flex flex-wrap gap-3">
                              {MATRIX_MODELS.map(model => {
                                const flew = pilotMonthlyFlew[pilot.id]?.has(model)
                                const isActive = tooltip?.pilotId === pilot.id && tooltip?.model === model && tooltip?.type === 'monthly'
                                return (
                                  <button
                                    key={model}
                                    onClick={e => { e.stopPropagation(); setTooltip(isActive ? null : { pilotId: pilot.id, model, type: 'monthly' }) }}
                                    className="flex flex-col items-center gap-1.5 transition-transform active:scale-90"
                                  >
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all ${
                                      flew ? 'bg-green-500/20 border-green-500' : 'bg-red-500/10 border-red-500/60'
                                    } ${isActive ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-white/40 scale-110' : ''}`}>
                                      <span className={`w-7 h-7 rounded-full ${flew ? 'bg-green-500' : 'bg-red-500/70'}`} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 text-center w-14 leading-tight">{model}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop: matrix table */}
              <div className="hidden sm:block overflow-x-auto">
                <table dir="rtl" className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/30">
                      <th rowSpan={2} className="px-5 py-3 text-xs font-medium text-slate-400 text-right align-bottom border-b border-slate-700/50">טייס</th>
                      <th colSpan={MATRIX_MODELS.length} className="px-3 py-2 text-xs font-medium text-slate-300 text-center border-b border-l border-slate-700/50">כשירות כללית</th>
                      <th colSpan={MATRIX_MODELS.length} className="px-3 py-2 text-xs font-medium text-amber-400/90 text-center border-b border-slate-700/50">אימון חודשי</th>
                    </tr>
                    <tr className="bg-slate-700/20">
                      {MATRIX_MODELS.map(m => (
                        <th key={`eh-${m}`} className="px-2 py-2 text-xs text-slate-400 font-normal text-center min-w-[4.5rem]">{m}</th>
                      ))}
                      {MATRIX_MODELS.map((m, idx) => (
                        <th key={`mh-${m}`} className={`px-2 py-2 text-xs text-amber-400/70 font-normal text-center min-w-[4.5rem] ${idx === 0 ? 'border-r-2 border-slate-600' : ''}`}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {db.pilots.map(pilot => (
                      <tr key={pilot.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-white whitespace-nowrap">{pilot.name}</td>
                        {MATRIX_MODELS.map(model => {
                          const flew = pilotEverFlew[pilot.id]?.has(model)
                          const isActive = tooltip?.pilotId === pilot.id && tooltip?.model === model && tooltip?.type === 'ever'
                          return (
                            <td key={`e-${model}`} className="text-center py-3">
                              <div className="relative inline-flex justify-center" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={e => { e.stopPropagation(); setTooltip(isActive ? null : { pilotId: pilot.id, model, type: 'ever' }) }}
                                  className={`w-5 h-5 rounded-full transition-all hover:scale-125 ${flew ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500/70 hover:bg-red-400/70'}`}
                                />
                                {isActive && (
                                  <div className="absolute top-full mt-2 z-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white whitespace-nowrap shadow-xl pointer-events-none">
                                    {flew
                                      ? `אימון אחרון: ${new Date(pilotLastFlewModel[pilot.id]?.[model]).toLocaleDateString('he-IL')}`
                                      : 'לא בוצע אימון מעולם'}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-600" />
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                        {MATRIX_MODELS.map((model, idx) => {
                          const flew = pilotMonthlyFlew[pilot.id]?.has(model)
                          const isActive = tooltip?.pilotId === pilot.id && tooltip?.model === model && tooltip?.type === 'monthly'
                          return (
                            <td key={`m-${model}`} className={`text-center py-3 ${idx === 0 ? 'border-r-2 border-slate-600' : ''}`}>
                              <div className="relative inline-flex justify-center" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={e => { e.stopPropagation(); setTooltip(isActive ? null : { pilotId: pilot.id, model, type: 'monthly' }) }}
                                  className={`w-5 h-5 rounded-full transition-all hover:scale-125 ${flew ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500/70 hover:bg-red-400/70'}`}
                                />
                                {isActive && (
                                  <div className="absolute top-full mt-2 z-20 bg-amber-900/90 border border-amber-700/60 rounded-lg px-3 py-2 text-xs text-amber-100 whitespace-nowrap shadow-xl pointer-events-none">
                                    {flew
                                      ? `בוצע ב‑${new Date(pilotLastMonthFlewModel[pilot.id]?.[model]).toLocaleDateString('he-IL')}`
                                      : 'לא בוצע אימון החודש'}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-amber-700/60" />
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <select value={addForm.tailNumber}
                  onChange={e => setAddForm(f => ({ ...f, tailNumber: e.target.value, battery: '' }))}
                  className={inputCls}>
                  {dronesForSelect.map(d => <option key={d.tailNumber} value={d.tailNumber}>{d.model} | {d.tailNumber}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>סוללה</label>
                {(() => {
                  const bats = droneBatteries.filter(b => b.droneTailNumber === addForm.tailNumber)
                  if (bats.length === 0) return (
                    <select disabled className={`${inputCls} opacity-50 cursor-not-allowed`}>
                      <option>אין סוללות רשומות לרחפן זה</option>
                    </select>
                  )
                  return (
                    <select value={addForm.battery} onChange={e => setAddForm(f => ({ ...f, battery: e.target.value }))} className={inputCls}>
                      <option value="">— בחר סוללה —</option>
                      {bats.map(b => <option key={b.id} value={b.batteryName}>{b.batteryName}</option>)}
                    </select>
                  )
                })()}
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
                <label className={labelCls}>תצפיתן (אופציונלי)</label>
                <input type="text" value={addForm.observer}
                  onChange={e => setAddForm(f => ({ ...f, observer: e.target.value }))}
                  placeholder="שם התצפיתן..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>גדוד (אופציונלי)</label>
                <select value={addForm.battalion} onChange={e => setAddForm(f => ({ ...f, battalion: e.target.value }))} className={inputCls}>
                  <option value="">— בחר גדוד —</option>
                  {BATTALIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              {(addForm.tailNumber === '4x-ujs' || addForm.tailNumber === '4x-xpg') && (
                <div className="sm:col-span-2 bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-400 mb-3">הטלת גז</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={addForm.gasDropped}
                      onChange={e => setAddForm(f => ({ ...f, gasDropped: e.target.checked, eventNumber: e.target.checked ? f.eventNumber : '' }))}
                      className="w-4 h-4 accent-amber-500" />
                    <span className="text-sm text-amber-200">בוצעה הטלת גז?</span>
                  </label>
                  {addForm.gasDropped && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-amber-400/80 mb-1.5">מספר אירוע</label>
                      <input type="text" value={addForm.eventNumber}
                        onChange={e => setAddForm(f => ({ ...f, eventNumber: e.target.value }))}
                        placeholder="מס׳ אירוע..." className={inputCls} />
                    </div>
                  )}
                </div>
              )}
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
                    {['תאריך', 'טייס', 'משימה', 'גדוד', 'תצפיתן', 'זנב', 'הטלת גז', 'סוללה', 'שעות', 'משך', 'פעולות'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {sortedHistory.map(f => (
                    <tr key={f.id} className={`transition-colors ${isFlightComplete(f) ? 'hover:bg-slate-700/20' : 'bg-red-900/20 hover:bg-red-900/30'}`}
                      title={isFlightComplete(f) ? undefined : `חסרים: ${missingFields(f).join(', ')}`}>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {new Date(f.date).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{f.pilotName}</td>
                      <td className="px-4 py-3 text-slate-300">{f.missionName}</td>
                      <td className="px-4 py-3 text-xs">{f.battalion ? <span className="bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 px-2 py-0.5 rounded-md whitespace-nowrap">{f.battalion}</span> : <span className="text-slate-600">—</span>}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{f.observer || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                        {droneLabel(f.tailNumber)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {f.gasDropped
                          ? <span className="text-amber-400 font-medium">✓{f.eventNumber ? ` ${f.eventNumber}` : ''}</span>
                          : <span className="text-slate-600">—</span>
                        }
                      </td>
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
            {/* Top buttons */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => downloadGeneralExcel(db.flights, db.pilots, gasDrops)}
                className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-emerald-600/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                ייצוא כללי
              </button>
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
                      {['#', 'שם', 'רישיון', 'טיסות', 'סה"כ שעות', 'שעות החודש', 'שעות מתחילת השנה', 'טיסה אחרונה', 'ייצוא', 'פעולות'].map(h => (
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
                          <td className="px-5 py-4 text-indigo-400 font-medium">{pilotMonthMins[p.id] ? fmtHours(pilotMonthMins[p.id]) : '—'}</td>
                          <td className="px-5 py-4 text-cyan-400 font-medium">{pilotYTDMins[p.id] ? fmtHours(pilotYTDMins[p.id]) : '—'}</td>
                          <td className="px-5 py-4 text-slate-400">
                            {lastDate ? new Date(lastDate).toLocaleDateString('he-IL') : '—'}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              onClick={() => downloadPilotExcel(pFlights, db.pilots, p.name)}
                              disabled={pFlights.length === 0}
                              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/40 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              ייצוא ({pFlights.length})
                            </button>
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

        {/* BATTERIES */}
        {activeTab === 'batteries' && (
          <div className="space-y-5">
            <div className="flex justify-end">
              <button
                onClick={() => setBatteryModal({ battery: null, tailNumber: '' })}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                הוסף סוללה
              </button>
            </div>
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-700/50">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className="text-amber-400">🔋</span> ניהול סוללות ({droneBatteries.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-slate-700/30 text-right">
                      {['רחפן', 'שם סוללה', 'מחזור', 'תאריך בדיקה', 'פעולות'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {droneBatteries.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">אין סוללות רשומות במערכת</td></tr>
                    ) : (
                      droneBatteries.map(bat => (
                        <tr key={bat.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-4 py-3 text-blue-300 font-mono text-xs">{bat.droneTailNumber}</td>
                          <td className="px-4 py-3 text-white font-medium">{bat.batteryName}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{bat.chargeCycle || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{bat.inspectionDate || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setBatteryModal({ battery: bat, tailNumber: bat.droneTailNumber })}
                                className="text-slate-400 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-blue-900/20"
                                title="עריכה"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button
                                onClick={() => setConfirmBatteryId(bat.id)}
                                className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20"
                                title="מחיקה"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DRONES */}
        {activeTab === 'drones' && (
          <div className="space-y-5">
            <div className="flex justify-end">
              <button
                onClick={() => downloadGeneralExcel(db.flights, db.pilots, gasDrops)}
                className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-emerald-600/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                ייצוא כללי ({db.flights.length} טיסות)
              </button>
            </div>

            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-700/50 flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className="text-blue-400">🚁</span> ניהול רחפנים ({droneDetails.length || DRONES.length})
                </h2>
                <button
                  onClick={() => setEditDroneModal('new')}
                  className="flex items-center gap-1.5 text-sm text-white bg-green-700/80 hover:bg-green-600 border border-green-600/50 px-3 py-2 rounded-xl transition-all font-medium shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  הוסף רחפן חדש
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/30 text-right">
                      {['דגם', 'מס\' זנב', 'משקל', 'מס\' סידורי (S.N)', 'טיסות', 'סה"כ שעות', 'טיסה אחרונה', 'פעולות'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(droneDetails.length > 0 ? droneDetails : DRONES.map(d => ({ tailNumber: d.tailNumber, model: d.model, weightKg: d.weightKg ?? null, serialNumber: d.serialNumber ?? '', extraRegistration: d.extraReg ?? null }))).map(drone => {
                      const dFlights = db.flights.filter(f => f.tailNumber === drone.tailNumber)
                      const totalMins = dFlights.reduce((a: number, f: Flight) => a + f.duration, 0)
                      const lastDate = [...dFlights].sort((a, b) => b.date.localeCompare(a.date))[0]?.date
                      const batteries = droneBatteries.filter(b => b.droneTailNumber === drone.tailNumber)
                      const isExpanded = expandedDrone === drone.tailNumber
                      return (
                        <>
                          <tr key={drone.tailNumber} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${isExpanded ? 'bg-slate-700/30' : ''}`}>
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-white">{drone.model}</span>
                              {drone.extraRegistration && (
                                <span className="block text-xs text-slate-500 font-mono mt-0.5">{drone.extraRegistration}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-blue-300 font-mono text-xs">{drone.tailNumber}</td>
                            <td className="px-4 py-3 text-slate-300 text-xs">
                              {drone.weightKg != null ? `${drone.weightKg} ק"ג` : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-mono text-slate-400 break-all">{drone.serialNumber || '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-300 text-center">{dFlights.length}</td>
                            <td className="px-4 py-3 text-blue-400 font-medium">{fmtHours(totalMins)}</td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {lastDate ? new Date(lastDate).toLocaleDateString('he-IL') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Edit drone */}
                                <button
                                  onClick={() => setEditDroneModal(drone)}
                                  className="text-xs text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-600 border border-slate-600/40 px-2.5 py-1.5 rounded-lg transition-all"
                                  title="עריכה"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                {/* Delete drone */}
                                <button
                                  onClick={() => setConfirmDeleteDroneId(drone.tailNumber)}
                                  className="text-xs text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 border border-red-700/30 px-2.5 py-1.5 rounded-lg transition-all"
                                  title="מחיקה"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                                {/* Batteries toggle */}
                                <button
                                  onClick={() => setExpandedDrone(isExpanded ? null : drone.tailNumber)}
                                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${isExpanded ? 'bg-amber-900/40 border-amber-700/50 text-amber-300' : 'bg-slate-700/60 border-slate-600/40 text-slate-300 hover:text-white hover:bg-slate-600'}`}
                                >
                                  🔋 {batteries.length > 0 ? `${batteries.length} סטים` : 'סוללות'}
                                </button>
                                {/* Excel */}
                                <button
                                  onClick={() => downloadDroneExcel(dFlights, db.pilots, drone.tailNumber)}
                                  disabled={dFlights.length === 0}
                                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/40 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                  XLS
                                </button>
                              </div>
                            </td>
                          </tr>
                          {/* Expandable battery rows */}
                          {isExpanded && (
                            <tr key={`${drone.tailNumber}-batteries`} className="bg-slate-900/60 border-b border-slate-700/30">
                              <td colSpan={8} className="px-6 py-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                                    🔋 סוללות — {drone.model} ({drone.tailNumber})
                                  </h4>
                                  <button
                                    onClick={() => setBatteryModal({ battery: null, tailNumber: drone.tailNumber })}
                                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-700/40 px-2.5 py-1.5 rounded-lg transition-all"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    הוסף סוללה
                                  </button>
                                </div>
                                {batteries.length === 0 ? (
                                  <p className="text-xs text-slate-500 py-2">אין סוללות רשומות לרחפן זה</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-right text-slate-500">
                                        <th className="pb-2 font-medium">שם סוללה</th>
                                        <th className="pb-2 font-medium">מחזור</th>
                                        <th className="pb-2 font-medium">תאריך בדיקה</th>
                                        <th className="pb-2 font-medium"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/30">
                                      {batteries.map(bat => (
                                        <tr key={bat.id} className="hover:bg-slate-800/50">
                                          <td className="py-2 font-medium text-white">{bat.batteryName}</td>
                                          <td className="py-2 text-slate-300 font-mono">{bat.chargeCycle || '—'}</td>
                                          <td className="py-2 text-slate-400">{bat.inspectionDate || '—'}</td>
                                          <td className="py-2">
                                            <div className="flex gap-1.5 justify-end">
                                              <button
                                                onClick={() => setBatteryModal({ battery: bat, tailNumber: drone.tailNumber })}
                                                className="text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 px-2 py-1 rounded transition-all"
                                              >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                              </button>
                                              <button
                                                onClick={() => setConfirmBatteryId(bat.id)}
                                                className="text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 px-2 py-1 rounded transition-all"
                                              >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
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
