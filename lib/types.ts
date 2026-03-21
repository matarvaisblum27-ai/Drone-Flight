export interface Pilot {
  id: string
  name: string
  license: string
}

export interface Flight {
  id: string
  pilotId: string
  pilotName: string
  date: string
  missionName: string
  tailNumber: string
  battery: string
  startTime: string
  endTime: string
  duration: number // minutes
  observer: string
  gasDropped: boolean
  eventNumber: string // free-text event number for gas drops (stored in gas_drop_time column)
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

/** Returns true when all operationally-important fields are filled. */
export function isFlightComplete(f: Flight): boolean {
  return !!(f.missionName && f.tailNumber && f.battery && f.startTime && f.endTime && f.duration > 0)
}

/** Lists human-readable names of missing fields for an incomplete flight. */
export function missingFields(f: Flight): string[] {
  const missing: string[] = []
  if (!f.missionName) missing.push('שם משימה')
  if (!f.tailNumber)  missing.push('מספר זנב')
  if (!f.battery)     missing.push('סוללה')
  if (!f.startTime)   missing.push('שעת המראה')
  if (!f.endTime)     missing.push('שעת נחיתה')
  if (!f.duration)    missing.push('משך טיסה')
  return missing
}
