'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FlightDB, Flight, Pilot, PilotStats, DroneInfo, DroneBattery, GasDrop, isFlightComplete, missingFields } from '@/lib/types'
import { DRONES, droneLabel } from '@/lib/drones'
import { useInactivityLogout } from '@/lib/useInactivityLogout'

const ADMIN_NAME = 'אורן וייסבלום'
const GAS_TAIL_NUMBERS = ['4x-xpg', '4x-ujs']
const BATTALIONS = ['גדוד אדומים', 'גדוד צפוני', 'גדוד דרומי', 'מודיעין', 'כללי']
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

function fmtShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(d)}.${parseInt(m)}.${y.slice(2)}`
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

// Columns: label/tail, date, missionName, battalion, p1name, p1license, p2name, p2license, observer
//   then per-flight sub-rows: #, startTime, endTime, pilotName, license, battery, duration, observer, gasDropped, eventNumber
const MISSION_COL_COUNT = 10

function buildMissionSheet(missions: MissionData[], pilots: Pilot[], headerLabel: (m: MissionData) => string): (string | number)[][] {
  const pilotMap = new Map(pilots.map(p => [p.id, p]))
  const rows: (string | number)[][] = []
  for (const mission of missions) {
    const date = new Date(mission.dateStr).toLocaleDateString('he-IL')
    const uniquePilotIds = Array.from(new Set(mission.flights.map(f => f.pilotId)))
    const pilot1 = pilotMap.get(uniquePilotIds[0])
    const pilot2 = uniquePilotIds[1] ? pilotMap.get(uniquePilotIds[1]) : undefined
    const observer = mission.flights.find(f => f.observer.length > 0)?.observer.join(', ') ?? ''
    const battalion = mission.flights.find(f => f.battalion.length > 0)?.battalion.join(', ') ?? ''
    // Mission header row
    rows.push([headerLabel(mission), date, mission.missionName, battalion, pilot1?.name ?? '', pilot1?.license ?? '', pilot2?.name ?? '', pilot2?.license ?? '', observer, ''])
    // Per-flight column headers
    rows.push(['', 'שעת התחלה', 'שעת סיום', 'שם מטיס', 'רישוי מטיס', 'סוללה', "סה\"כ דק' טיסה", 'תצפיתן', 'הטלת גז', 'מספר אירוע'])
    for (let i = 0; i < MAX_FLIGHTS_PER_MISSION; i++) {
      const f = mission.flights[i]
      if (f) {
        const p = pilotMap.get(f.pilotId)
        rows.push([i + 1, f.startTime, f.endTime, f.pilotName, p?.license ?? '', f.battery, fmtDuration(f.duration), f.observer.join(', '), f.gasDropped ? 'כן' : '', f.eventNumber ?? ''])
      } else {
        rows.push([i + 1, '', '', '', '', '', '0:00:00', '', '', ''])
      }
    }
    rows.push(["סה\"כ למשימה", '', '', '', '', '', fmtDuration(mission.missionTotal), '', '', ''])
    rows.push(["סיכום מדף קודם", '', '', '', '', '', fmtDuration(mission.prevCumulative), '', '', ''])
    rows.push(["סה\"כ מצטבר", '', '', '', '', '', fmtDuration(mission.cumulative), '', '', ''])
    rows.push(Array(MISSION_COL_COUNT).fill(''))
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
    ws['!cols'] = Array(MISSION_COL_COUNT).fill({ wch: 16 })
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
    ws['!cols'] = Array(MISSION_COL_COUNT).fill({ wch: 16 })
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
    ws['!cols'] = Array(MISSION_COL_COUNT).fill({ wch: 16 })
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
    ws['!cols'] = Array(MISSION_COL_COUNT).fill({ wch: 16 })
    XLSX.utils.book_append_sheet(wb, ws, 'תרגול חודשי')
  }
  if (!wb.SheetNames.length) { alert('אין נתונים לייצוא'); return }
  XLSX.writeFile(wb, 'logbook_general.xlsx')
}

// ── Two-step delete confirmation ───────────────────────────────────────────────
function TwoStepDeleteDialog({ onConfirm, onCancel }: {
  onConfirm: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)

  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
        <div className="relative bg-slate-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-xs shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600/60 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white">האם ברצונך למחוק?</h3>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel}
              className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all">
              ביטול
            </button>
            <button onClick={() => setStep(2)}
              className="px-4 py-2 text-sm text-white bg-slate-600 hover:bg-slate-500 border border-slate-500/60 rounded-lg transition-all font-medium">
              המשך
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-red-700/60 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-7">
          <div className="text-5xl mb-4">⚠️</div>
          <h3 className="text-xl font-bold text-red-400 mb-2">אזהרה: פעולה זו אינה ניתנת לביטול!</h3>
          <p className="text-sm text-slate-300">האם אתה בטוח שברצונך למחוק?</p>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel}
            className="px-5 py-2.5 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all">
            לא, בטל
          </button>
          <button onClick={onConfirm}
            className="px-5 py-2.5 text-sm text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all font-bold shadow-lg shadow-red-900/40">
            כן, מחק לצמיתות
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm save dialog ───────────────────────────────────────────────────────
function ConfirmSaveDialog({ onConfirm, onCancel }: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-600/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-900/30 border border-blue-700/40 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">אישור שמירה</h3>
            <p className="text-xs text-slate-400 mt-0.5">האם אתה בטוח שברצונך לשמור את השינויים?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all">
            ביטול
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all font-medium">
            כן, שמור
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
  observers: string[]; gasDropped: boolean; eventNumber: string; battalions: string[]
  policeLogbookEntered: boolean
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
    observers:   flight.observer.length > 0 ? [...flight.observer] : [''],
    gasDropped:  flight.gasDropped  ?? false,
    eventNumber: flight.eventNumber ?? '',
    battalions:  flight.battalion.length > 0 ? [...flight.battalion] : [''],
    policeLogbookEntered: flight.policeLogbookEntered ?? false,
  })
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

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
    setShowConfirm(true)
  }

  return (
    <>
    {showConfirm && <ConfirmSaveDialog onConfirm={() => onSave(form)} onCancel={() => setShowConfirm(false)} />}
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
          <div className="sm:col-span-2">
            <label className={labelCls}>תצפיתן (אופציונלי)</label>
            <div className="space-y-2">
              {form.observers.map((obs, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input type="text" value={obs}
                    onChange={e => {
                      const observers = [...form.observers]
                      observers[idx] = e.target.value
                      setForm(f => ({ ...f, observers }))
                    }}
                    placeholder="שם התצפיתן..." className={`${inputCls} flex-1`} />
                  {idx > 0 && (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, observers: f.observers.filter((_, i) => i !== idx) }))}
                      className="px-2.5 py-2 text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg transition-all font-bold flex-shrink-0">
                      −
                    </button>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => setForm(f => ({ ...f, observers: [...f.observers, ''] }))}
                className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/20 border border-indigo-700/30 px-3 py-1.5 rounded-lg transition-all">
                + הוסף תצפיתן
              </button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>גדוד (אופציונלי)</label>
            <div className="space-y-2">
              {form.battalions.map((bat, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select value={bat}
                    onChange={e => {
                      const battalions = [...form.battalions]
                      battalions[idx] = e.target.value
                      setForm(f => ({ ...f, battalions }))
                    }}
                    className={`${inputCls} flex-1`}>
                    <option value="">— בחר גדוד —</option>
                    {BATTALIONS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {idx > 0 && (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, battalions: f.battalions.filter((_, i) => i !== idx) }))}
                      className="px-2.5 py-2 text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg transition-all font-bold flex-shrink-0">
                      −
                    </button>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => setForm(f => ({ ...f, battalions: [...f.battalions, ''] }))}
                className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/20 border border-indigo-700/30 px-3 py-1.5 rounded-lg transition-all">
                + הוסף גדוד
              </button>
            </div>
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
          <div className="sm:col-span-2 bg-cyan-900/20 border border-cyan-700/40 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.policeLogbookEntered}
                onChange={e => setForm(f => ({ ...f, policeLogbookEntered: e.target.checked }))}
                className="w-4 h-4 accent-cyan-500" />
              <span className="text-sm text-cyan-200">📘 בוצעה הזנה ללוג בוק משטרתי</span>
            </label>
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
    </>
  )
}

// ── Pilot edit modal ──────────────────────────────────────────────────────────
const ADMIN_FIXED_NAME = 'אורן וייסבלום'
function PilotEditModal({ pilot, onSave, onCancel, canManageAdmin }: {
  pilot: Pilot | null  // null = add mode
  onSave: (name: string, license: string, password: string, isAdmin: boolean) => void
  onCancel: () => void
  canManageAdmin: boolean  // only אורן וייסבלום can change this
}) {
  const [name, setName] = useState(pilot?.name ?? '')
  const [license, setLicense] = useState(pilot?.license ?? '')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(pilot?.isAdmin ?? false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const isAdd = pilot === null
  const isFixedAdmin = pilot?.name === ADMIN_FIXED_NAME

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  const handleSave = () => {
    if (!name.trim() || !license.trim()) { setError('יש למלא שם ומספר רישיון'); return }
    if (isAdd && !password.trim()) { setError('יש להגדיר סיסמה לטייס חדש'); return }
    if (!isAdd) { setShowConfirm(true); return }
    onSave(name.trim(), license.trim(), password.trim(), isAdmin)
  }

  return (
    <>
    {showConfirm && <ConfirmSaveDialog onConfirm={() => onSave(name.trim(), license.trim(), password.trim(), isAdmin)} onCancel={() => setShowConfirm(false)} />}
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
          <div>
            <label className={labelCls}>
              {isAdd ? 'סיסמה' : 'סיסמה חדשה (השאר ריק לשמור קיימת)'}
            </label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder={isAdd ? 'הזן סיסמה' : '••••••••'}
              className={inputCls} />
          </div>
          {canManageAdmin && !isFixedAdmin && (
            <div className="flex items-center justify-between bg-slate-700/40 border border-slate-600/40 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm text-white font-medium">הרשאת סגן</p>
                <p className="text-xs text-slate-400">גישה לדשבורד בתצוגת סגן</p>
              </div>
              <button
                onClick={() => setIsAdmin(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${isAdmin ? 'bg-blue-600' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isAdmin ? 'translate-x-5 right-0.5' : 'translate-x-0 right-5'}`} />
              </button>
            </div>
          )}
          {canManageAdmin && isFixedAdmin && (
            <div className="flex items-center gap-2 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2">
              <span className="text-xs text-blue-400">מפקד ראשי — הרשאות מנהל קבועות</span>
            </div>
          )}
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
    </>
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
  const [showConfirm, setShowConfirm] = useState(false)
  const droneData = {
    tailNumber: form.tailNumber.trim(),
    model: form.model.trim(),
    weightKg: form.weightKg ? Number(form.weightKg) : null,
    serialNumber: form.serialNumber.trim(),
    extraRegistration: form.extraRegistration.trim() || null,
  }
  const handleSave = () => {
    if (!form.tailNumber.trim() || !form.model.trim()) {
      alert('דגם ומספר זנב הם שדות חובה'); return
    }
    if (!isNew) { setShowConfirm(true); return }
    onSave(droneData)
  }
  return (
    <>
    {showConfirm && <ConfirmSaveDialog onConfirm={() => onSave(droneData)} onCancel={() => setShowConfirm(false)} />}
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
    </>
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
  const [showConfirm, setShowConfirm] = useState(false)
  return (
    <>
    {showConfirm && <ConfirmSaveDialog onConfirm={() => { onSave({ id: battery?.id, droneTailNumber: form.droneTailNumber, batteryName: form.batteryName.trim(), chargeCycle: form.chargeCycle, inspectionDate: form.inspectionDate }) }} onCancel={() => setShowConfirm(false)} />}
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
              if (battery) { setShowConfirm(true); return }
              onSave({ droneTailNumber: form.droneTailNumber, batteryName: form.batteryName.trim(), chargeCycle: form.chargeCycle, inspectionDate: form.inspectionDate })
            }}
            className="flex-1 px-4 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all font-medium">
            {battery ? 'שמור' : 'הוסף'}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  useInactivityLogout()
  const router = useRouter()
  const [db, setDb] = useState<FlightDB | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'ranking' | 'add' | 'history' | 'pilots' | 'batteries' | 'drones' | 'logs'>('overview')
  const [addForm, setAddForm] = useState({
    pilotId: '', date: '', missionName: '', tailNumber: '4x-pzk',
    battery: '', startTime: '', endTime: '',
    observers: [''], gasDropped: false, eventNumber: '', battalions: [''],
    policeLogbookEntered: false,
  })
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [expandedPilot, setExpandedPilot] = useState<string | null>(null)
  const [expandedDroneCard, setExpandedDroneCard] = useState<string | null>(null)
  const [expandedBattalion, setExpandedBattalion] = useState<string | null>(null)
  const [expandedKpi, setExpandedKpi] = useState<'hours' | 'missions' | 'gas' | null>(null)
  const [expandedHoursMonth, setExpandedHoursMonth] = useState<string | null>(null)
  const [expandedMissionsMonth, setExpandedMissionsMonth] = useState<string | null>(null)
  const [expandedGasMonth, setExpandedGasMonth] = useState<string | null>(null)
  const [battalionMigrating, setBattalionMigrating] = useState(false)
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
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [isViewer, setIsViewer] = useState(false)
  const [loginLogs, setLoginLogs] = useState<Array<{ id: number; pilot_name: string; success: boolean; ip_address: string; created_at: string }>>([])
  const [loginLogsTotal, setLoginLogsTotal] = useState(0)
  const [loginLogsOffset, setLoginLogsOffset] = useState(0)
  const [loginLogsLoading, setLoginLogsLoading] = useState(false)
  // authChecked gates all data loading — nothing renders until DB permission is confirmed
  const [authChecked, setAuthChecked] = useState(false)
  // History tab pagination
  const [historyPage, setHistoryPage] = useState(25)
  // History navigation — highlight a specific mission group and filter by pilot
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
  const [historyPilotFilter, setHistoryPilotFilter] = useState<{ pilotName: string; month: string } | null>(null)
  // Mission merge state
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null)
  const [mergeTargetKey, setMergeTargetKey] = useState('')
  const [merging, setMerging] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState<{ sourceKey: string; targetKey: string } | null>(null)

  // ── Auth gate ───────────────────────────────────────────────────────────────
  // Calls /api/verify-session on every mount and re-focus.
  // Nothing is rendered until this confirms a valid admin/deputy session.
  const checkPermissions = useCallback(async () => {
    try {
      const r = await fetch('/api/verify-session', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      })
      if (!r.ok) { window.location.replace('/'); return }
      const s = await r.json()
      if (!s.isAdmin && !s.isViewer) { window.location.replace('/pilot'); return }
      setCurrentUserName(s.name)
      setIsViewer(s.isViewer ?? false)
      setAuthChecked(true)
    } catch {
      window.location.replace('/')
    }
  }, [])

  useEffect(() => {
    checkPermissions()
    const onFocus = () => checkPermissions()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [checkPermissions])

  // Full admin — only אורן וייסבלום
  const canEdit = currentUserName === ADMIN_NAME
  // Deputy (סגן) + admin — can edit flights, drones, batteries and add flights
  const canManageData = canEdit || isViewer

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

  const fetchLoginLogs = useCallback(async (offset = 0, append = false) => {
    setLoginLogsLoading(true)
    try {
      const res = await fetch(`/api/login-logs?offset=${offset}`, { cache: 'no-store' })
      if (!res.ok) return
      const { logs, total } = await res.json()
      setLoginLogsTotal(total)
      setLoginLogs(prev => append ? [...prev, ...logs] : logs)
      setLoginLogsOffset(offset + (logs as unknown[]).length)
    } finally {
      setLoginLogsLoading(false)
    }
  }, [])

  // Reset history pagination when leaving the history tab
  useEffect(() => { if (activeTab !== 'history') setHistoryPage(25) }, [activeTab])

  // ── History navigation (hooks must be before any early return) ────────────
  const navigateToMission = useCallback((missionKey: string) => {
    setHistoryPilotFilter(null)
    setHistoryPage(9999)
    setActiveTab('history')
    setHighlightedKey(missionKey)
  }, [])

  const navigateToPilotHistory = useCallback((pilotName: string, month: string) => {
    setHistoryPilotFilter({ pilotName, month })
    setHistoryPage(9999)
    setHighlightedKey(null)
    setActiveTab('history')
  }, [])

  // Scroll to highlighted mission after history tab renders
  useEffect(() => {
    if (!highlightedKey || activeTab !== 'history') return
    const timer = setTimeout(() => {
      const el = document.getElementById(`mission-${highlightedKey}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    const clearTimer = setTimeout(() => setHighlightedKey(null), 3500)
    return () => { clearTimeout(timer); clearTimeout(clearTimer) }
  }, [highlightedKey, activeTab])

  // Data loading is gated — only starts after DB confirms permission
  useEffect(() => { if (authChecked) fetchDB() }, [authChecked, fetchDB])
  useEffect(() => { if (authChecked) fetchDroneData() }, [authChecked, fetchDroneData])
  useEffect(() => { if (authChecked) fetchGasDrops() }, [authChecked, fetchGasDrops])
  // Login logs — load on tab open, then auto-refresh every 30 s
  useEffect(() => {
    if (!authChecked || activeTab !== 'logs') return
    fetchLoginLogs(0, false)
    const iv = setInterval(() => fetchLoginLogs(0, false), 30_000)
    return () => clearInterval(iv)
  }, [authChecked, activeTab, fetchLoginLogs])

  // ── Hard auth gate — render NOTHING until session is confirmed ─────────────
  // This is the first conditional return in the component. authChecked is false
  // until /api/verify-session returns 200. If there is no valid session the
  // checkPermissions callback already called window.location.replace('/'), so
  // we just keep showing the spinner until the navigation completes.
  if (!authChecked) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center" style={{ zIndex: 9999 }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

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
  // Count UNIQUE missions (not individual flights) using missionId or date+name as key
  const missionKeyFn = (f: Flight) => f.missionId ? `m:${f.missionId}` : `d:${f.date}||${f.missionName}`
  const missionsThisMonth = new Set(db.flights.filter(f => f.date.startsWith(thisMonth)).map(missionKeyFn)).size
  const missionsThisYear  = new Set(db.flights.filter(f => f.date.startsWith(thisYear)).map(missionKeyFn)).size

  // Monthly hours YTD (for KPI card expansion)
  const monthlyHoursYTD: Record<string, number> = {}
  db.flights.filter(f => f.date.startsWith(thisYear)).forEach(f => {
    const month = f.date.slice(0, 7)
    monthlyHoursYTD[month] = (monthlyHoursYTD[month] || 0) + f.duration
  })
  const totalMinutesYTD = Object.values(monthlyHoursYTD).reduce((a, v) => a + v, 0)
  // Monthly missions YTD (for KPI card expansion)
  const monthlyMissionSetsYTD: Record<string, Set<string>> = {}
  db.flights.filter(f => f.date.startsWith(thisYear)).forEach(f => {
    const month = f.date.slice(0, 7)
    if (!monthlyMissionSetsYTD[month]) monthlyMissionSetsYTD[month] = new Set()
    monthlyMissionSetsYTD[month].add(missionKeyFn(f))
  })
  const monthlyMissionsYTD: Record<string, number> = {}
  Object.entries(monthlyMissionSetsYTD).forEach(([m, s]) => { monthlyMissionsYTD[m] = s.size })
  // Months array: Jan through current month of thisYear
  const kpiMonths = Array.from({ length: now.getMonth() + 1 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${thisYear}-${m}`
  })

  // Per-pilot monthly hours (for KPI hours drill-down)
  const monthlyHoursByPilot: Record<string, Record<string, number>> = {}
  db.flights.filter(f => f.date.startsWith(thisYear)).forEach(f => {
    const month = f.date.slice(0, 7)
    if (!monthlyHoursByPilot[month]) monthlyHoursByPilot[month] = {}
    monthlyHoursByPilot[month][f.pilotName] = (monthlyHoursByPilot[month][f.pilotName] || 0) + f.duration
  })

  // Per-month mission list with participants (for KPI missions drill-down)
  interface KpiMission { missionKey: string; missionName: string; date: string; pilots: string[] }
  const monthlyMissionsList: Record<string, KpiMission[]> = {}
  const kpiMissionMap = new Map<string, { name: string; date: string; pilots: Set<string> }>()
  db.flights.filter(f => f.date.startsWith(thisYear)).forEach(f => {
    const key = missionKeyFn(f)
    if (!kpiMissionMap.has(key)) kpiMissionMap.set(key, { name: f.missionName, date: f.date, pilots: new Set() })
    kpiMissionMap.get(key)!.pilots.add(f.pilotName)
  })
  kpiMissionMap.forEach((m, key) => {
    const month = m.date.slice(0, 7)
    if (!monthlyMissionsList[month]) monthlyMissionsList[month] = []
    monthlyMissionsList[month].push({ missionKey: key, missionName: m.name, date: m.date, pilots: Array.from(m.pilots).sort() })
  })
  Object.values(monthlyMissionsList).forEach(ms => ms.sort((a, b) => a.date.localeCompare(b.date)))

  // Combined gas drops YTD (flights with gas_dropped=true + gas_drops table, deduplicated)
  interface CombinedGasDrop { date: string; pilotName: string; tailNumber: string; model: string; missionName: string; eventNumber: string; missionKey?: string }
  const droneModelMap = new Map(DRONES.map(d => [d.tailNumber, d.model]))
  const allGasDropsYTD: CombinedGasDrop[] = []
  const gasDropDedupKeys = new Set<string>()
  db.flights.filter(f => f.gasDropped && f.date.startsWith(thisYear)).forEach(f => {
    const key = `${f.date}|${f.tailNumber}|${f.pilotName}`
    if (!gasDropDedupKeys.has(key)) {
      gasDropDedupKeys.add(key)
      allGasDropsYTD.push({ date: f.date, pilotName: f.pilotName, tailNumber: f.tailNumber, model: droneModelMap.get(f.tailNumber) ?? f.tailNumber, missionName: f.missionName, eventNumber: f.eventNumber ?? '', missionKey: missionKeyFn(f) })
    }
  })
  gasDrops.filter(g => g.date.startsWith(thisYear)).forEach(g => {
    const key = `${g.date}|${g.tailNumber}|${g.pilotName}`
    if (!gasDropDedupKeys.has(key)) {
      gasDropDedupKeys.add(key)
      allGasDropsYTD.push({ date: g.date, pilotName: g.pilotName, tailNumber: g.tailNumber, model: droneModelMap.get(g.tailNumber) ?? g.tailNumber, missionName: '—', eventNumber: g.gasDropTime ?? '' })
    }
  })
  allGasDropsYTD.sort((a, b) => a.date.localeCompare(b.date))
  const monthlyGasDropsList: Record<string, CombinedGasDrop[]> = {}
  allGasDropsYTD.forEach(drop => {
    const month = drop.date.slice(0, 7)
    if (!monthlyGasDropsList[month]) monthlyGasDropsList[month] = []
    monthlyGasDropsList[month].push(drop)
  })
  const gasDropsThisMonth = (monthlyGasDropsList[thisMonth] ?? []).length
  const gasDropsThisYear = allGasDropsYTD.length

  // Battalion breakdown — unique missions (all-time for bar, YTD monthly for drill-down)
  interface BnMissionEntry { missionKey: string; missionName: string; date: string; pilots: string[]; drones: string[] }
  const battalionMissionSets: Record<string, Set<string>> = {}
  BATTALIONS.forEach(b => { battalionMissionSets[b] = new Set() })
  db.flights.forEach(f => { f.battalion.forEach(b => { if (b && battalionMissionSets[b]) battalionMissionSets[b].add(missionKeyFn(f)) }) })
  const battalionCounts: Record<string, number> = {}
  BATTALIONS.forEach(b => { battalionCounts[b] = battalionMissionSets[b].size })
  const maxBattalionCount = Math.max(...Object.values(battalionCounts), 1)

  // YTD monthly missions per battalion
  const battalionMonthlyMissions: Record<string, Record<string, BnMissionEntry[]>> = {}
  BATTALIONS.forEach(b => { battalionMonthlyMissions[b] = {} })
  const bnYtdMap = new Map<string, { name: string; date: string; pilots: Set<string>; drones: Set<string>; battalions: Set<string> }>()
  db.flights.filter(f => f.date.startsWith(thisYear)).forEach(f => {
    const key = missionKeyFn(f)
    if (!bnYtdMap.has(key)) bnYtdMap.set(key, { name: f.missionName, date: f.date, pilots: new Set(), drones: new Set(), battalions: new Set() })
    const m = bnYtdMap.get(key)!
    m.pilots.add(f.pilotName)
    m.drones.add(f.tailNumber)
    f.battalion.forEach(b => { if (b) m.battalions.add(b) })
  })
  bnYtdMap.forEach((mission, key) => {
    const month = mission.date.slice(0, 7)
    mission.battalions.forEach(b => {
      if (!battalionMonthlyMissions[b]) return
      if (!battalionMonthlyMissions[b][month]) battalionMonthlyMissions[b][month] = []
      battalionMonthlyMissions[b][month].push({ missionKey: key, missionName: mission.name, date: mission.date, pilots: (Array.from(mission.pilots) as string[]).sort(), drones: (Array.from(mission.drones) as string[]).sort() })
    })
  })

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
        observer: addForm.observers.filter(Boolean), gasDropped: addForm.gasDropped, eventNumber: addForm.eventNumber,
        battalion: addForm.battalions.filter(Boolean),
        policeLogbookEntered: addForm.policeLogbookEntered,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setAddError(err.error === 'DB_MIGRATION_NEEDED' ? 'נדרש עדכון DB — ראה חלונית האזהרה בראש הדף' : (err.error ?? `שגיאה בשמירה (${res.status})`)); return
    }
    setAddSuccess(`טיסה נוספה בהצלחה עבור ${pilot.name}`)
    setAddForm({ pilotId: '', date: '', missionName: '', tailNumber: '4x-pzk', battery: '', startTime: '', endTime: '', observers: [''], gasDropped: false, eventNumber: '', battalions: [''], policeLogbookEntered: false })
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
        observer: form.observers.filter(Boolean), gasDropped: form.gasDropped, eventNumber: form.eventNumber,
        battalion: form.battalions.filter(Boolean),
        policeLogbookEntered: form.policeLogbookEntered,
      }),
    })
    setEditFlight(null)
    fetchDB()
  }

  const handleAddPilot = async (name: string, license: string, password: string) => {
    const res = await fetch('/api/pilots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, license, password }),
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

  const handleEditPilot = async (name: string, license: string, newPassword: string, isAdmin: boolean) => {
    if (!editPilot || editPilot === 'add') return
    const pilot = editPilot as Pilot
    const body: Record<string, unknown> = { id: pilot.id, name, license, isAdmin }
    if (newPassword) body.newPassword = newPassword
    const res = await fetch('/api/pilots', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { alert('שגיאה בעריכת טייס'); return }
    setDb(prev => prev ? {
      ...prev,
      pilots: prev.pilots.map(p => p.id === pilot.id ? { ...p, name, license, isAdmin } : p),
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error === 'drone_not_found' ? 'הרחפן לא נמצא במסד הנתונים' : `שגיאה במחיקת רחפן: ${err.error ?? res.status}`)
      return
    }
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

  const handleMergeMission = async (sourceKey: string, targetKey: string) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return
    const sourceGroup = adminMissionGroups.find(g => g.key === sourceKey)
    const targetGroup = adminMissionGroups.find(g => g.key === targetKey)
    if (!sourceGroup || !targetGroup) return
    setMerging(true)
    try {
      // Move all flights from source to target
      await Promise.all(sourceGroup.flights.map(f =>
        fetch('/api/flights', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: f.id,
            missionName: targetGroup.missionName,
            missionId: targetGroup.missionId ?? null,
          }),
        })
      ))
      // Delete missions-table entry for source if it had one
      if (sourceGroup.missionId) {
        await fetch(`/api/missions?id=${sourceGroup.missionId}`, { method: 'DELETE' })
      }
      setMergingGroupKey(null)
      setMergeTargetKey('')
      fetchDB()
    } finally {
      setMerging(false)
    }
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

  const handleRenameBattalions = async () => {
    setBattalionMigrating(true)
    const res = await fetch('/api/admin/rename-battalions', { method: 'POST' })
    setBattalionMigrating(false)
    if (!res.ok) { alert('שגיאה בעדכון שמות גדודים'); return }
    const { updated, errors } = await res.json()
    if (updated === 0) {
      alert('אין טיסות לעדכון — כל הגדודים כבר עם השמות החדשים.')
    } else {
      alert(`עדכון גדודים:\n✅ ${updated} טיסות עודכנו\n❌ ${errors} שגיאות`)
    }
    fetchDB()
  }

  const sortedHistory = [...db.flights].sort((a, b) => b.date.localeCompare(a.date))

  // Mission groups for history tab
  interface AdminMissionGroup {
    key: string; date: string; missionName: string; missionNum: number
    missionId: string | undefined  // undefined for legacy flights
    flights: Flight[]; totalMinutes: number
  }
  const adminMissionGroups: AdminMissionGroup[] = (() => {
    const getKey = (f: Flight) => f.missionId ? `m:${f.missionId}` : `d:${f.date}||${f.missionName}`
    const getMissionId = (key: string) => key.startsWith('m:') ? key.slice(2) : undefined
    const chrono = [...db.flights].sort((a, b) =>
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
    const groups = new Map<string, AdminMissionGroup>()
    for (const f of sortedHistory) {
      const key = getKey(f)
      if (!groups.has(key)) groups.set(key, { key, date: f.date, missionName: f.missionName, missionNum: keyToNum[key] ?? 1, missionId: getMissionId(key), flights: [], totalMinutes: 0 })
      const g = groups.get(key)!
      g.flights.push(f)
      g.totalMinutes += f.duration
    }
    return Array.from(groups.values()).sort((a, b) => {
      const d = b.date.localeCompare(a.date)
      return d !== 0 ? d : b.missionNum - a.missionNum
    })
  })()
  // History visible groups — filtered by pilot/month when navigating from hours drill-down
  const visibleMissionGroups = historyPilotFilter
    ? adminMissionGroups.filter(g =>
        g.date.startsWith(historyPilotFilter.month) &&
        g.flights.some(f => f.pilotName === historyPilotFilter.pilotName)
      )
    : adminMissionGroups

  const inputCls = 'w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  return (
    <div className="min-h-screen">
      {/* Modals */}
      {confirmId && (
        <TwoStepDeleteDialog
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
        <TwoStepDeleteDialog
          onConfirm={() => handleDeletePilot(confirmPilotId)}
          onCancel={() => setConfirmPilotId(null)}
        />
      )}
      {editPilot !== null && (
        <PilotEditModal
          pilot={editPilot === 'add' ? null : editPilot as Pilot}
          onSave={editPilot === 'add' ? handleAddPilot : handleEditPilot}
          onCancel={() => setEditPilot(null)}
          canManageAdmin={currentUserName === ADMIN_NAME}
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
        <TwoStepDeleteDialog
          onConfirm={() => handleDeleteDrone(confirmDeleteDroneId)}
          onCancel={() => setConfirmDeleteDroneId(null)}
        />
      )}
      {batteryModal && (
        <BatteryModal battery={batteryModal.battery} tailNumber={batteryModal.tailNumber} drones={dronesForSelect} onSave={handleSaveBattery} onCancel={() => setBatteryModal(null)} />
      )}
      {confirmBatteryId && (
        <TwoStepDeleteDialog
          onConfirm={() => handleDeleteBattery(confirmBatteryId)}
          onCancel={() => setConfirmBatteryId(null)}
        />
      )}
      {confirmMerge && (
        <ConfirmSaveDialog
          onConfirm={() => { handleMergeMission(confirmMerge.sourceKey, confirmMerge.targetKey); setConfirmMerge(null) }}
          onCancel={() => setConfirmMerge(null)}
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
            <span className="text-sm text-slate-300 hidden sm:block">{currentUserName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${canEdit ? 'bg-blue-600/20 text-blue-400 border-blue-700/40' : isViewer ? 'bg-purple-600/20 text-purple-400 border-purple-700/40' : 'bg-slate-600/20 text-slate-400 border-slate-700/40'}`}>
              {canEdit ? 'מפקד' : isViewer ? 'סגן' : 'צפייה'}
            </span>
            {!canEdit && (
              <a href="/pilot"
                className="text-slate-400 hover:text-white text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 px-3 py-1.5 rounded-lg transition-all">
                דשבורד אישי
              </a>
            )}
            <button onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/')}
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

        {/* Stat cards — 2 compact expandable cards + gas drops card */}
        <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Hours card */}
          <div className={`bg-slate-800/70 border ${expandedKpi === 'hours' ? 'border-blue-500/50' : 'border-slate-700/50'} rounded-xl overflow-hidden transition-colors`}>
            <button
              onClick={() => setExpandedKpi(expandedKpi === 'hours' ? null : 'hours')}
              className="w-full px-4 py-3 flex items-center gap-2 active:bg-slate-700/40 transition-colors"
              dir="rtl"
            >
              <span className="text-base shrink-0">🕐</span>
              <span className="text-sm font-semibold text-white shrink-0">שעות טיסה</span>
              <span className="text-slate-600 shrink-0">|</span>
              <span className="text-xs text-slate-400 shrink-0">החודש:</span>
              <span className="text-sm font-medium text-blue-300 shrink-0">{fmtHours(monthlyHoursYTD[thisMonth] ?? 0)}</span>
              <span className="text-slate-600 shrink-0">|</span>
              <span className="text-xs text-slate-400 shrink-0">השנה:</span>
              <span className="text-sm font-semibold text-white shrink-0">{fmtHours(totalMinutesYTD)}</span>
              <svg className={`w-3.5 h-3.5 text-slate-500 mr-auto shrink-0 transition-transform ${expandedKpi === 'hours' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedKpi === 'hours' && (() => {
              const maxMins = Math.max(...kpiMonths.map(m => monthlyHoursYTD[m] ?? 0), 1)
              return (
                <div className="border-t border-slate-700/50 px-4 pt-3 pb-4 space-y-1" dir="rtl">
                  {kpiMonths.map(monthKey => {
                    const mins = monthlyHoursYTD[monthKey] ?? 0
                    const pct = (mins / maxMins) * 100
                    const monthIdx = parseInt(monthKey.slice(5, 7), 10) - 1
                    const isMonthOpen = expandedHoursMonth === monthKey
                    const pilotRows = Object.entries(monthlyHoursByPilot[monthKey] ?? {})
                      .sort((a, b) => b[1] - a[1])
                    return (
                      <div key={monthKey}>
                        <button
                          onClick={() => setExpandedHoursMonth(isMonthOpen ? null : monthKey)}
                          className={`w-full flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${isMonthOpen ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'} ${mins === 0 ? 'opacity-40' : ''}`}
                          disabled={mins === 0}
                        >
                          <span className="text-xs text-slate-300 w-14 shrink-0 text-right">{HEBREW_MONTH_NAMES[monthIdx]}</span>
                          <div className="flex-1 h-2.5 bg-slate-600/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-l from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                              style={{ width: `${Math.max(pct, mins > 0 ? 3 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-blue-300 w-16 text-left shrink-0">{mins > 0 ? fmtHours(mins) : '—'}</span>
                          {mins > 0 && (
                            <svg className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${isMonthOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                        {isMonthOpen && (
                          <div className="mr-4 mb-1 mt-0.5 space-y-0.5 border-r-2 border-slate-600/50 pr-3">
                            {pilotRows.map(([name, pilotMins]) => (
                              <button key={name} onClick={() => navigateToPilotHistory(name, monthKey)}
                                className="w-full flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-slate-700/40 transition-colors group text-right">
                                <span className="text-xs text-blue-300 group-hover:text-blue-200 flex-1 text-right group-hover:underline">{name}</span>
                                <span className="text-xs font-medium text-slate-300 shrink-0">{fmtHours(pilotMins)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div className="flex items-center gap-3 border-t border-slate-600/50 pt-2.5 mt-1 px-2">
                    <span className="text-xs font-semibold text-white w-14 shrink-0 text-right">סה&quot;כ שנתי</span>
                    <div className="flex-1" />
                    <span className="text-xs font-bold text-white w-16 text-left shrink-0">{fmtHours(totalMinutesYTD)}</span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Missions card */}
          <div className={`bg-slate-800/70 border ${expandedKpi === 'missions' ? 'border-blue-500/50' : 'border-slate-700/50'} rounded-xl overflow-hidden transition-colors`}>
            <button
              onClick={() => setExpandedKpi(expandedKpi === 'missions' ? null : 'missions')}
              className="w-full px-4 py-3 flex items-center gap-2 active:bg-slate-700/40 transition-colors"
              dir="rtl"
            >
              <span className="text-base shrink-0">📋</span>
              <span className="text-sm font-semibold text-white shrink-0">משימות</span>
              <span className="text-slate-600 shrink-0">|</span>
              <span className="text-xs text-slate-400 shrink-0">החודש:</span>
              <span className="text-sm font-medium text-blue-300 shrink-0">{missionsThisMonth}</span>
              <span className="text-slate-600 shrink-0">|</span>
              <span className="text-xs text-slate-400 shrink-0">השנה:</span>
              <span className="text-sm font-semibold text-white shrink-0">{missionsThisYear}</span>
              <svg className={`w-3.5 h-3.5 text-slate-500 mr-auto shrink-0 transition-transform ${expandedKpi === 'missions' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedKpi === 'missions' && (() => {
              const maxCount = Math.max(...kpiMonths.map(m => monthlyMissionsYTD[m] ?? 0), 1)
              return (
                <div className="border-t border-slate-700/50 px-4 pt-3 pb-4 space-y-1" dir="rtl">
                  {kpiMonths.map(monthKey => {
                    const count = monthlyMissionsYTD[monthKey] ?? 0
                    const pct = (count / maxCount) * 100
                    const monthIdx = parseInt(monthKey.slice(5, 7), 10) - 1
                    const isMonthOpen = expandedMissionsMonth === monthKey
                    const missions = monthlyMissionsList[monthKey] ?? []
                    return (
                      <div key={monthKey}>
                        <button
                          onClick={() => setExpandedMissionsMonth(isMonthOpen ? null : monthKey)}
                          className={`w-full flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${isMonthOpen ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'} ${count === 0 ? 'opacity-40' : ''}`}
                          disabled={count === 0}
                        >
                          <span className="text-xs text-slate-300 w-14 shrink-0 text-right">{HEBREW_MONTH_NAMES[monthIdx]}</span>
                          <div className="flex-1 h-2.5 bg-slate-600/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-l from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                              style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-blue-300 w-16 text-left shrink-0">{count > 0 ? `${count} משימות` : '—'}</span>
                          {count > 0 && (
                            <svg className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${isMonthOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                        {isMonthOpen && (
                          <div className="mr-4 mb-1 mt-0.5 space-y-1 border-r-2 border-slate-600/50 pr-3">
                            {missions.map(ms => (
                              <button key={ms.missionKey} onClick={() => navigateToMission(ms.missionKey)}
                                className="w-full flex items-start gap-2 py-1 px-1.5 rounded-lg hover:bg-slate-700/40 transition-colors group text-right">
                                <span className="text-xs text-slate-500 shrink-0 mt-px">{fmtShortDate(ms.date)}</span>
                                <span className="text-xs text-blue-300 group-hover:text-blue-200 flex-1 text-right leading-snug group-hover:underline">{ms.missionName}</span>
                                <span className="text-xs text-slate-400 shrink-0 text-left">{ms.pilots.join(', ')}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div className="flex items-center gap-3 border-t border-slate-600/50 pt-2.5 mt-1 px-2">
                    <span className="text-xs font-semibold text-white w-14 shrink-0 text-right">סה&quot;כ שנתי</span>
                    <div className="flex-1" />
                    <span className="text-xs font-bold text-white w-16 text-left shrink-0">{missionsThisYear} משימות</span>
                  </div>
                </div>
              )
            })()}
          </div>

        </div>

        {/* Gas drops card — full width */}
        <div className={`bg-slate-800/70 border ${expandedKpi === 'gas' ? 'border-amber-500/50' : 'border-slate-700/50'} rounded-xl overflow-hidden transition-colors`}>
          <button
            onClick={() => setExpandedKpi(expandedKpi === 'gas' ? null : 'gas')}
            className="w-full px-4 py-3 flex items-center gap-2 active:bg-slate-700/40 transition-colors"
            dir="rtl"
          >
            <span className="text-base shrink-0">🔥</span>
            <span className="text-sm font-semibold text-white shrink-0">הטלות גז</span>
            <span className="text-slate-600 shrink-0">|</span>
            <span className="text-xs text-slate-400 shrink-0">החודש:</span>
            <span className="text-sm font-medium text-amber-300 shrink-0">{gasDropsThisMonth}</span>
            <span className="text-slate-600 shrink-0">|</span>
            <span className="text-xs text-slate-400 shrink-0">השנה:</span>
            <span className="text-sm font-semibold text-white shrink-0">{gasDropsThisYear}</span>
            <svg className={`w-3.5 h-3.5 text-slate-500 mr-auto shrink-0 transition-transform ${expandedKpi === 'gas' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedKpi === 'gas' && (() => {
            const maxCount = Math.max(...kpiMonths.map(m => (monthlyGasDropsList[m] ?? []).length), 1)
            return (
              <div className="border-t border-slate-700/50 px-4 pt-3 pb-4 space-y-1" dir="rtl">
                {kpiMonths.map(monthKey => {
                  const drops = monthlyGasDropsList[monthKey] ?? []
                  const count = drops.length
                  const pct = (count / maxCount) * 100
                  const monthIdx = parseInt(monthKey.slice(5, 7), 10) - 1
                  const isMonthOpen = expandedGasMonth === monthKey
                  return (
                    <div key={monthKey}>
                      <button
                        onClick={() => setExpandedGasMonth(isMonthOpen ? null : monthKey)}
                        className={`w-full flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${isMonthOpen ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'} ${count === 0 ? 'opacity-40' : ''}`}
                        disabled={count === 0}
                      >
                        <span className="text-xs text-slate-300 w-14 shrink-0 text-right">{HEBREW_MONTH_NAMES[monthIdx]}</span>
                        <div className="flex-1 h-2.5 bg-slate-600/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-l from-amber-500 to-orange-500 rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-amber-300 w-20 text-left shrink-0">{count > 0 ? `${count} הטלות` : '—'}</span>
                        {count > 0 && (
                          <svg className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${isMonthOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </button>
                      {isMonthOpen && (
                        <div className="mr-4 mb-1 mt-0.5 space-y-2 border-r-2 border-amber-700/40 pr-3">
                          {drops.map((drop, i) => {
                            const isOp = !!drop.eventNumber
                            const canNav = !!drop.missionKey
                            return (
                              <div
                                key={i}
                                onClick={canNav ? () => navigateToMission(drop.missionKey!) : undefined}
                                className={`py-1.5 px-2 space-y-0.5 rounded-lg transition-colors ${canNav ? 'cursor-pointer hover:bg-amber-900/20 group' : ''}`}
                                title={canNav ? 'לחץ לעבור להיסטוריה' : undefined}
                              >
                                {/* Line 1: date · pilot · drone */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="text-xs font-medium text-slate-300 shrink-0">{fmtShortDate(drop.date)}</span>
                                  <span className="text-slate-600 shrink-0">·</span>
                                  <span className={`text-xs shrink-0 ${canNav ? 'text-amber-300 group-hover:text-amber-200 group-hover:underline' : 'text-slate-300'}`}>{drop.pilotName}</span>
                                  <span className="text-slate-600 shrink-0">·</span>
                                  <span className="text-xs text-slate-400 shrink-0">{drop.model} <span className="font-mono text-slate-500">{drop.tailNumber}</span></span>
                                  {canNav && <span className="text-[10px] text-amber-600 shrink-0">← לחץ לעבור</span>}
                                </div>
                                {/* Line 2: type · mission · event number */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isOp ? 'bg-green-900/50 text-green-400 border border-green-700/40' : 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40'}`}>
                                    {isOp ? 'ירי מבצעי' : 'אימון גז'}
                                  </span>
                                  {drop.missionName && drop.missionName !== '—' && (
                                    <>
                                      <span className="text-slate-600 shrink-0">·</span>
                                      <span className="text-xs text-slate-400 shrink-0">משימה: <span className="text-slate-300">{drop.missionName}</span></span>
                                    </>
                                  )}
                                  {drop.eventNumber && (
                                    <>
                                      <span className="text-slate-600 shrink-0">·</span>
                                      <span className="text-xs text-slate-400 shrink-0">אירוע: <span className="text-green-300 font-medium">{drop.eventNumber}</span></span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex items-center gap-3 border-t border-slate-600/50 pt-2.5 mt-1 px-2">
                  <span className="text-xs font-semibold text-white w-14 shrink-0 text-right">סה&quot;כ שנתי</span>
                  <div className="flex-1" />
                  <span className="text-xs font-bold text-white w-20 text-left shrink-0">{gasDropsThisYear} הטלות</span>
                </div>
              </div>
            )
          })()}
        </div>

        </div>{/* end space-y-4 */}

        {/* Battalion breakdown card */}
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl">
          <div className="p-5 border-b border-slate-700/50">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span>🎖️</span> התפלגות משימות לפי גדוד
            </h2>
          </div>
          <div className="p-4 space-y-2" dir="rtl">
            {BATTALIONS.map(bn => {
              const count = battalionCounts[bn] ?? 0
              const pct = maxBattalionCount > 0 ? (count / maxBattalionCount) * 100 : 0
              const isOpen = expandedBattalion === bn
              const monthlyData = Object.entries(battalionMonthlyMissions[bn] ?? {}).sort()
              const ytdTotal = monthlyData.reduce((s, [, ms]) => s + ms.length, 0)
              return (
                <div key={bn}>
                  {/* Clickable bar row */}
                  <button
                    onClick={() => setExpandedBattalion(isOpen ? null : bn)}
                    className={`w-full text-right bg-slate-700/40 border ${isOpen ? 'border-blue-500/50 bg-slate-700/60' : 'border-slate-600/30'} rounded-xl px-4 py-3 transition-all active:scale-[0.99]`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 w-28 shrink-0 text-right leading-tight">{bn}</span>
                      <div className="flex-1 h-3 bg-slate-600/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-blue-400 w-8 text-left shrink-0">{count}</span>
                      <svg className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expandable monthly breakdown */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isOpen ? '4000px' : '0px', opacity: isOpen ? 1 : 0 }}
                  >
                    <div className="mt-2 bg-slate-900/60 border border-slate-700/40 rounded-xl p-4" dir="rtl">
                      {monthlyData.length === 0 ? (
                        <p className="text-sm text-slate-600 text-center py-2">אין משימות השנה</p>
                      ) : (
                        <div className="space-y-4">
                          {monthlyData.map(([month, missions]) => {
                            const monthIdx = parseInt(month.slice(5, 7)) - 1
                            return (
                              <div key={month} className="bg-slate-800/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-bold text-white">{HEBREW_MONTH_NAMES[monthIdx]}</p>
                                  <span className="text-xs font-semibold text-blue-400">{missions.length} משימות</span>
                                </div>
                                <div className="space-y-2">
                                  {missions.sort((a, b) => a.date.localeCompare(b.date)).map(ms => (
                                    <button key={ms.missionKey} onClick={() => navigateToMission(ms.missionKey)}
                                      className="w-full text-right bg-slate-700/40 hover:bg-slate-700/70 rounded-lg px-3 py-2 transition-colors group">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-indigo-300 group-hover:text-indigo-200 group-hover:underline leading-snug">{ms.missionName || <span className="text-slate-500 italic">ללא שם</span>}</p>
                                        <span className="text-[10px] text-slate-500 shrink-0">{new Date(ms.date).toLocaleDateString('he-IL')}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                                        {ms.pilots.length > 0 && (
                                          <span className="text-[10px] text-slate-400">👨‍✈️ {ms.pilots.join(', ')}</span>
                                        )}
                                        {ms.drones.length > 0 && (
                                          <span className="text-[10px] text-slate-400">🚁 {ms.drones.map(droneLabel).join(', ')}</span>
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                          <div className="border-t border-slate-600/50 pt-2 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-200">סה&quot;כ שנתי</span>
                            <span className="text-sm font-bold text-blue-400">{ytdTotal} משימות</span>
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

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 overflow-x-auto">
          {([
            { key: 'overview',   label: 'סקירה',          icon: '📊', minLevel: 'viewer'  },
            { key: 'ranking',    label: 'דירוג טייסים',    icon: '🏆', minLevel: 'viewer'  },
            { key: 'add',        label: 'הוספת טיסה',      icon: '➕', minLevel: 'deputy'  },
            { key: 'history',    label: 'היסטוריה',        icon: '📜', minLevel: 'viewer'  },
            { key: 'pilots',     label: 'ניהול טייסים',    icon: '👨‍✈️', minLevel: 'viewer'  },
            { key: 'batteries',  label: 'ניהול סוללות',    icon: '🔋', minLevel: 'viewer'  },
            { key: 'drones',     label: 'ניהול רחפנים',    icon: '🚁', minLevel: 'viewer'  },
            { key: 'logs',       label: 'יומן כניסות',     icon: '🔐', minLevel: 'admin'   },
          ] as const).filter(({ minLevel }) =>
            minLevel === 'viewer' || (minLevel === 'deputy' && canManageData) || (minLevel === 'admin' && canEdit)
          ).map(({ key, label, icon }) => (
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
            {canEdit && (
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
                  onClick={handleRenameBattalions}
                  disabled={battalionMigrating}
                  className="flex items-center gap-2 bg-violet-700/80 hover:bg-violet-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-violet-600/50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {battalionMigrating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🎖️'}
                  עדכן שמות גדודים
                </button>
                <button
                  onClick={() => downloadGeneralExcel(db.flights, db.pilots, gasDrops)}
                  className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-emerald-600/50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  ייצוא כללי לאקסל ({db.flights.length} טיסות)
                </button>
              </div>
            )}

            {/* ── Section 1: Drone Summary ────────────────────────────────── */}
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl">
              <div className="p-5 border-b border-slate-700/50">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>🚁</span> סיכום רחפנים
                </h2>
              </div>

              {/* Mobile + desktop: unified clickable cards */}
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" dir="rtl">
                {dronesForSelect.map(drone => {
                  const ytdMins = droneYTDMins[drone.tailNumber] ?? 0
                  const maxYTD = Math.max(...dronesForSelect.map(d => droneYTDMins[d.tailNumber] ?? 0), 1)
                  const pct = ytdMins / maxYTD
                  const isGas = GAS_TAIL_NUMBERS.includes(drone.tailNumber)
                  const lastGasDropDate = isGas ? (() => {
                    const fromTable  = gasDrops.filter(g => g.tailNumber === drone.tailNumber).map(g => g.date)
                    const fromFlights = db.flights.filter(f => f.tailNumber === drone.tailNumber && f.gasDropped).map(f => f.date)
                    const all = [...fromTable, ...fromFlights].sort((a, b) => b.localeCompare(a))
                    return all[0] ?? null
                  })() : null
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
                            <p className={`text-xs font-semibold ${lastGasDropDate ? 'text-green-400' : 'text-slate-500'}`}>
                              {lastGasDropDate ? new Date(lastGasDropDate).toLocaleDateString('he-IL') : '—'}
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
              <div className="sm:col-span-2">
                <label className={labelCls}>תצפיתן (אופציונלי)</label>
                <div className="space-y-2">
                  {addForm.observers.map((obs, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input type="text" value={obs}
                        onChange={e => {
                          const observers = [...addForm.observers]
                          observers[idx] = e.target.value
                          setAddForm(f => ({ ...f, observers }))
                        }}
                        placeholder="שם התצפיתן..." className={`${inputCls} flex-1`} />
                      {idx > 0 && (
                        <button type="button"
                          onClick={() => setAddForm(f => ({ ...f, observers: f.observers.filter((_, i) => i !== idx) }))}
                          className="px-2.5 py-2 text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg transition-all font-bold flex-shrink-0">
                          −
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setAddForm(f => ({ ...f, observers: [...f.observers, ''] }))}
                    className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/20 border border-indigo-700/30 px-3 py-1.5 rounded-lg transition-all">
                    + הוסף תצפיתן
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>גדוד (אופציונלי)</label>
                <div className="space-y-2">
                  {addForm.battalions.map((bat, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select value={bat}
                        onChange={e => {
                          const battalions = [...addForm.battalions]
                          battalions[idx] = e.target.value
                          setAddForm(f => ({ ...f, battalions }))
                        }}
                        className={`${inputCls} flex-1`}>
                        <option value="">— בחר גדוד —</option>
                        {BATTALIONS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      {idx > 0 && (
                        <button type="button"
                          onClick={() => setAddForm(f => ({ ...f, battalions: f.battalions.filter((_, i) => i !== idx) }))}
                          className="px-2.5 py-2 text-red-400 hover:text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg transition-all font-bold flex-shrink-0">
                          −
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setAddForm(f => ({ ...f, battalions: [...f.battalions, ''] }))}
                    className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/20 border border-indigo-700/30 px-3 py-1.5 rounded-lg transition-all">
                    + הוסף גדוד
                  </button>
                </div>
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
              <div className="sm:col-span-2 bg-cyan-900/20 border border-cyan-700/40 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={addForm.policeLogbookEntered}
                    onChange={e => setAddForm(f => ({ ...f, policeLogbookEntered: e.target.checked }))}
                    className="w-4 h-4 accent-cyan-500" />
                  <span className="text-sm text-cyan-200">📘 בוצעה הזנה ללוג בוק משטרתי</span>
                </label>
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
          <div className="space-y-4">
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span className="text-blue-400">📜</span> היסטוריית טיסות
              </h2>
              <span className="text-xs text-slate-400">{adminMissionGroups.length} משימות · {db.flights.length} טיסות</span>
            </div>
            {historyPilotFilter && (
              <div className="flex items-center gap-3 bg-blue-900/30 border border-blue-700/40 rounded-xl px-4 py-2.5" dir="rtl">
                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className="text-xs text-blue-300 flex-1">
                  מסנן: <span className="font-semibold text-white">{historyPilotFilter.pilotName}</span>
                  {' · '}
                  <span className="font-semibold text-white">{HEBREW_MONTH_NAMES[parseInt(historyPilotFilter.month.slice(5, 7), 10) - 1]}</span>
                  {' · '}
                  {visibleMissionGroups.length} משימות
                </span>
                <button
                  onClick={() => setHistoryPilotFilter(null)}
                  className="text-xs text-blue-400 hover:text-white bg-blue-900/40 hover:bg-blue-800/50 border border-blue-700/40 px-2.5 py-1 rounded-lg transition-all">
                  נקה סינון
                </button>
              </div>
            )}
            {visibleMissionGroups.slice(0, historyPage).map(group => {
              // Other missions on the same date (for merge dropdown)
              const sameDayGroups = adminMissionGroups.filter(g => g.date === group.date && g.key !== group.key)
              const isMerging = mergingGroupKey === group.key
              const monthIdx = new Date(group.date).getMonth()
              const monthBorder = ['border-l-blue-500', 'border-l-green-500', 'border-l-yellow-500'][monthIdx % 3]
              const monthBadge  = ['bg-blue-900/40 text-blue-300 border-blue-700/40', 'bg-green-900/40 text-green-300 border-green-700/40', 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40'][monthIdx % 3]
              const monthName   = HEBREW_MONTH_NAMES[monthIdx]
              const isHighlighted = highlightedKey === group.key
              return (
              <div
                key={group.key}
                id={`mission-${group.key}`}
                className={`border border-slate-700/50 border-l-4 ${monthBorder} rounded-xl overflow-hidden ${isHighlighted ? 'mission-highlight' : 'bg-slate-800/70'}`}
              >
                {/* Mission header */}
                <div className="bg-indigo-900/30 border-b border-indigo-700/30 px-5 py-3 flex items-center gap-3 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${monthBadge}`}>{monthName}</span>
                  <span className="text-white text-sm font-semibold truncate flex-1">
                    📋 {group.missionName || <span className="text-slate-500 italic">ללא שם</span>}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(group.date).toLocaleDateString('he-IL')}</span>
                  {group.flights[0]?.battalion.length > 0 && (
                    <span className="text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 px-2 py-0.5 rounded-md shrink-0">{group.flights[0].battalion.join(', ')}</span>
                  )}
                  {group.totalMinutes > 0 && (
                    <span className="text-xs text-indigo-300 font-medium shrink-0">{fmtHours(group.totalMinutes)}</span>
                  )}
                  {/* Merge button — admin only, only when there are other missions on same day */}
                  {canEdit && sameDayGroups.length > 0 && !isMerging && (
                    <button
                      onClick={() => { setMergingGroupKey(group.key); setMergeTargetKey(sameDayGroups[0].key) }}
                      className="text-xs text-amber-400 hover:text-amber-300 bg-amber-900/20 hover:bg-amber-900/30 border border-amber-700/30 px-2 py-1 rounded-lg transition-all shrink-0"
                    >
                      מזג למשימה
                    </button>
                  )}
                  {/* Inline merge UI */}
                  {canEdit && isMerging && (
                    <div className="w-full flex items-center gap-2 mt-2 pt-2 border-t border-indigo-700/30">
                      <span className="text-xs text-amber-300 shrink-0">מזג לתוך:</span>
                      <select
                        value={mergeTargetKey}
                        onChange={e => setMergeTargetKey(e.target.value)}
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 min-w-0"
                      >
                        {sameDayGroups.map(g => (
                          <option key={g.key} value={g.key}>{g.missionName || 'ללא שם'}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => { if (mergeTargetKey) setConfirmMerge({ sourceKey: group.key, targetKey: mergeTargetKey }) }}
                        disabled={merging || !mergeTargetKey}
                        className="text-xs text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 rounded-lg transition-all shrink-0 font-medium"
                      >
                        {merging ? '...' : 'בצע מיזוג'}
                      </button>
                      <button
                        onClick={() => { setMergingGroupKey(null); setMergeTargetKey('') }}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-all shrink-0"
                      >
                        ביטול
                      </button>
                    </div>
                  )}
                </div>
                {/* Flights table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-700/20 text-right">
                        {['#', 'טייס', 'תצפיתן', 'זנב', 'הטלת גז', 'לוג בוק', 'סוללה', 'שעות', 'משך', ...(canManageData ? ['פעולות'] : [])].map(h => (
                          <th key={h} className="px-4 py-2 text-xs font-medium text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {group.flights.map((f, fi) => (
                        <tr key={f.id} className={`transition-colors ${isFlightComplete(f) ? 'hover:bg-slate-700/20' : 'bg-red-900/20 hover:bg-red-900/30'}`}
                          title={isFlightComplete(f) ? undefined : `חסרים: ${missingFields(f).join(', ')}`}>
                          <td className="px-4 py-3 text-slate-500 text-xs">טיסה {fi + 1}</td>
                          <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{f.pilotName}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{f.observer.length > 0 ? f.observer.join(', ') : '—'}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs">{droneLabel(f.tailNumber)}</td>
                          <td className="px-4 py-3 text-xs">
                            {f.gasDropped
                              ? <span className="text-amber-400 font-medium">✓{f.eventNumber ? ` ${f.eventNumber}` : ''}</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {f.policeLogbookEntered
                              ? <span className="text-cyan-300 font-medium">📘 הוזן</span>
                              : <span className="text-slate-600">לא הוזן</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-slate-700/50 px-2 py-0.5 rounded text-xs text-slate-300">{f.battery}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{f.startTime}–{f.endTime}</td>
                          <td className="px-4 py-3 text-blue-400 font-medium whitespace-nowrap">{fmtHours(f.duration)}</td>
                          {canManageData && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setEditFlight(f)} title="עריכה"
                                  className="text-slate-400 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-blue-900/20">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button onClick={() => setConfirmId(f.id)} title="מחיקה"
                                  className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )
            })}
            {visibleMissionGroups.length > historyPage && (
              <button
                onClick={() => setHistoryPage(p => p + 25)}
                className="w-full py-3 text-sm font-medium text-slate-300 bg-slate-800/70 border border-slate-700/50 hover:bg-slate-700/70 rounded-xl transition-all">
                טען עוד ({visibleMissionGroups.length - historyPage} נותרו)
              </button>
            )}
          </div>
        )}

        {/* PILOTS */}
        {activeTab === 'pilots' && (
          <div className="space-y-5">
            {/* Top buttons — admin only */}
            {canEdit && (
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
            )}

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
                      {['#', 'שם', 'הרשאות', 'רישיון', 'טיסות', 'סה"כ שעות', 'שעות החודש', 'שעות מתחילת השנה', 'טיסה אחרונה', ...(canEdit ? ['ייצוא', 'פעולות'] : [])].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-medium text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {db.pilots.map((p, i) => {
                      const pFlights = db.flights.filter(f => f.pilotId === p.id)
                      const totalMins = pFlights.reduce((a, f) => a + f.duration, 0)
                      const lastDate = pFlights.sort((a, b) => b.date.localeCompare(a.date))[0]?.date
                      const isAdmin = p.name === ADMIN_NAME || p.isAdmin === true
                      return (
                        <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-5 py-4 text-xs text-slate-500">{i + 1}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-700/40 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
                                {p.name[0]}
                              </div>
                              <span className="text-sm font-medium text-white">{p.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {p.name === ADMIN_NAME ? (
                              <span className="text-xs bg-blue-600/20 text-blue-400 border border-blue-700/40 px-2 py-0.5 rounded-full whitespace-nowrap">מפקד ראשי</span>
                            ) : p.isAdmin ? (
                              <span className="text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-700/40 px-2 py-0.5 rounded-full whitespace-nowrap">סגן</span>
                            ) : (
                              <span className="text-xs text-slate-600">טייס</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-400 font-mono text-xs">{p.license}</td>
                          <td className="px-5 py-4 text-slate-300">{pFlights.length}</td>
                          <td className="px-5 py-4 text-blue-400 font-medium">{fmtHours(totalMins)}</td>
                          <td className="px-5 py-4 text-indigo-400 font-medium">{pilotMonthMins[p.id] ? fmtHours(pilotMonthMins[p.id]) : '—'}</td>
                          <td className="px-5 py-4 text-cyan-400 font-medium">{pilotYTDMins[p.id] ? fmtHours(pilotYTDMins[p.id]) : '—'}</td>
                          <td className="px-5 py-4 text-slate-400">
                            {lastDate ? new Date(lastDate).toLocaleDateString('he-IL') : '—'}
                          </td>
                          {canEdit && (
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
                          )}
                          {canEdit && (
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
                          )}
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
            {canManageData && (
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
            )}
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
                      {['רחפן', 'שם סוללה', 'מחזור', 'תאריך בדיקה', ...(canManageData ? ['פעולות'] : [])].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {droneBatteries.length === 0 ? (
                      <tr><td colSpan={canManageData ? 5 : 4} className="px-4 py-8 text-center text-slate-500 text-sm">אין סוללות רשומות במערכת</td></tr>
                    ) : (
                      droneBatteries.map(bat => (
                        <tr key={bat.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-4 py-3 text-blue-300 font-mono text-xs">{bat.droneTailNumber}</td>
                          <td className="px-4 py-3 text-white font-medium">{bat.batteryName}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{bat.chargeCycle || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{bat.inspectionDate || '—'}</td>
                          {canManageData && (
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
                          )}
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
            {canEdit && (
              <div className="flex justify-end">
                <button
                  onClick={() => downloadGeneralExcel(db.flights, db.pilots, gasDrops)}
                  className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-emerald-600/50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  ייצוא כללי ({db.flights.length} טיסות)
                </button>
              </div>
            )}

            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-700/50 flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className="text-blue-400">🚁</span> ניהול רחפנים ({droneDetails.length || DRONES.length})
                </h2>
                {canManageData && (
                  <button
                    onClick={() => setEditDroneModal('new')}
                    className="flex items-center gap-1.5 text-sm text-white bg-green-700/80 hover:bg-green-600 border border-green-600/50 px-3 py-2 rounded-xl transition-all font-medium shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    הוסף רחפן חדש
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/30 text-right">
                      {['דגם', 'מס\' זנב', 'משקל', 'מס\' סידורי (S.N)', 'טיסות', 'סה"כ שעות', 'טיסה אחרונה', ...(canManageData ? ['פעולות'] : [])].map(h => (
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
                            {canManageData && (
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
                                  {/* Excel — admin only */}
                                  {canEdit && (
                                    <button
                                      onClick={() => downloadDroneExcel(dFlights, db.pilots, drone.tailNumber)}
                                      disabled={dFlights.length === 0}
                                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/40 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                      XLS
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                          {/* Expandable battery rows */}
                          {isExpanded && (
                            <tr key={`${drone.tailNumber}-batteries`} className="bg-slate-900/60 border-b border-slate-700/30">
                              <td colSpan={canManageData ? 8 : 7} className="px-6 py-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                                    🔋 סוללות — {drone.model} ({drone.tailNumber})
                                  </h4>
                                  {canManageData && (
                                    <button
                                      onClick={() => setBatteryModal({ battery: null, tailNumber: drone.tailNumber })}
                                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-700/40 px-2.5 py-1.5 rounded-lg transition-all"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                      הוסף סוללה
                                    </button>
                                  )}
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
                                        {canManageData && <th className="pb-2 font-medium"></th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/30">
                                      {batteries.map(bat => (
                                        <tr key={bat.id} className="hover:bg-slate-800/50">
                                          <td className="py-2 font-medium text-white">{bat.batteryName}</td>
                                          <td className="py-2 text-slate-300 font-mono">{bat.chargeCycle || '—'}</td>
                                          <td className="py-2 text-slate-400">{bat.inspectionDate || '—'}</td>
                                          {canManageData && (
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
                                          )}
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
        {/* LOGIN LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-5">
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-700/50 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <span className="text-rose-400">🔐</span> יומן כניסות
                  </h2>
                  {loginLogsTotal > 0 && (
                    <span className="text-xs text-slate-500">
                      {loginLogs.length} / {loginLogsTotal} רשומות
                    </span>
                  )}
                  <span className="text-xs text-slate-600">• רענון אוטומטי כל 30 ש׳</span>
                </div>
                <button
                  onClick={() => fetchLoginLogs(0, false)}
                  disabled={loginLogsLoading}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                >
                  <svg className={`w-3.5 h-3.5 ${loginLogsLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  רענן
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-slate-700/30 text-right">
                      {['תאריך ושעה', 'טייס', 'סטטוס', 'כתובת IP'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {loginLogs.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                        {loginLogsLoading ? 'טוען...' : 'אין רשומות יומן'}
                      </td></tr>
                    ) : loginLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                          {log.created_at ? new Date(log.created_at).toLocaleString('he-IL') : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-200 text-sm">{log.pilot_name}</td>
                        <td className="px-4 py-3">
                          {log.success ? (
                            <span className="text-xs bg-green-900/30 text-green-400 border border-green-700/40 px-2 py-0.5 rounded-full">הצלחה ✓</span>
                          ) : (
                            <span className="text-xs bg-red-900/30 text-red-400 border border-red-700/40 px-2 py-0.5 rounded-full">כישלון ✗</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{log.ip_address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Load More */}
              {loginLogsOffset < loginLogsTotal && (
                <div className="p-4 border-t border-slate-700/50 flex justify-center">
                  <button
                    onClick={() => fetchLoginLogs(loginLogsOffset, true)}
                    disabled={loginLogsLoading}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 px-5 py-2 rounded-xl transition-all disabled:opacity-50"
                  >
                    {loginLogsLoading ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    ) : null}
                    טען עוד ({loginLogsTotal - loginLogsOffset} נותרו)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
