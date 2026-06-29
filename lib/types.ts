export type QualificationLight = 'green' | 'orange' | 'red'

export interface Pilot {
  id: string
  name: string
  license: string
  isAdmin?: boolean
  /** Manual override for the qualification traffic-light. null/undefined = auto-compute from flights. */
  qualificationOverride?: QualificationLight | null
  /** Drone MODELS the pilot is required to be qualified on. Empty array = use the default list. */
  requiredDroneModels?: string[]
}

export interface Mission {
  id: string
  date: string
  name: string
  battalion: string[]
  observer: string[]
  missionNumber: number
  createdAt: string
  isTraining: boolean   // טיסת אימון (במקום משימה מבצעית). שם המשימה משמש כ"מהות האימון"
}

export interface Flight {
  id: string
  pilotId: string
  pilotName: string
  date: string
  missionName: string
  missionId?: string  // links to missions table (undefined for legacy flights)
  tailNumber: string
  battery: string
  startTime: string
  endTime: string
  duration: number // minutes
  observer: string[]
  gasDropped: boolean
  eventNumber: string // free-text event number for gas drops (stored in gas_drop_time column)
  battalion: string[]   // גדוד
  policeLogbookEntered: boolean // בוצע הזנה ללוג בוק משטרתי
  batteryCount: number  // כמה סוללות נצרכו לטיסה רצופה (ברירת מחדל 1)
  note: string          // הערה חופשית, עד 50 תווים (אכיפה ב-UI)
  isTraining?: boolean  // נגזר מ-Mission.isTraining — לא נשמר ישירות בטיסה
}

/** Max length for the free-text per-flight note. */
export const FLIGHT_NOTE_MAX_LEN = 50

/** True if a mission name reads like a training (legacy data has no is_training flag,
 *  but uses names like "אימון הטסה" / "אימון חירום" / etc.). */
export function isTrainingName(name: string): boolean {
  return /אימון/.test(name || '')
}

export interface FlightDB {
  pilots: Pilot[]
  flights: Flight[]
  batteries: Record<string, number>
  migrationNeeded?: boolean
}

export interface PilotStats {
  pilot: Pilot
  totalMinutes: number
  totalFlights: number
  lastFlightDate: string
  lastDuration: number
}

export interface DroneInfo {
  tailNumber: string
  model: string
  weightKg: number | null
  serialNumber: string
  extraRegistration: string | null
}

export interface GasDrop {
  id: string
  pilotName: string
  date: string
  tailNumber: string
  gasDropTime: string
  notes: string
}

export interface DroneBattery {
  id: string
  droneTailNumber: string
  batteryName: string
  chargeCycle: string      // e.g. "287-282"
  inspectionDate: string
}

/** Returns true when all operationally-important fields are filled.
 *  Note: battery is optional — drones without registered batteries (e.g. Mavic 2, Matrice)
 *  can still produce a "complete" flight record. */
export function isFlightComplete(f: Flight): boolean {
  return !!(f.missionName && f.tailNumber && f.startTime && f.endTime && f.duration > 0)
}

/** Lists human-readable names of missing fields for an incomplete flight. */
export function missingFields(f: Flight): string[] {
  const missing: string[] = []
  if (!f.missionName) missing.push('שם משימה')
  if (!f.tailNumber)  missing.push('מספר זנב')
  if (!f.startTime)   missing.push('שעת המראה')
  if (!f.endTime)     missing.push('שעת נחיתה')
  if (!f.duration)    missing.push('משך טיסה')
  return missing
}
