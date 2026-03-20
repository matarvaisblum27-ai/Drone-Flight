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
  batteryStart: number
  batteryEnd: number
  duration: number // minutes
  observer: string
  gasDropped: boolean
  gasDropTime: string
}

export interface FlightDB {
  pilots: Pilot[]
  flights: Flight[]
  batteries: Record<string, number>
}

export interface PilotStats {
  pilot: Pilot
  totalMinutes: number
  totalFlights: number
  lastFlightDate: string
  lastDuration: number
}
