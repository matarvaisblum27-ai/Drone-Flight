import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { FlightDB, Flight } from '@/lib/types'

const DB_PATH = path.join(process.cwd(), 'data', 'flights.json')

function readDB(): FlightDB {
  const raw = fs.readFileSync(DB_PATH, 'utf-8')
  return JSON.parse(raw)
}

function writeDB(db: FlightDB) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

export async function GET() {
  const db = readDB()
  return NextResponse.json(db)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = readDB()

  const newFlight: Flight = {
    id: `f${Date.now()}`,
    pilotId: body.pilotId,
    pilotName: body.pilotName,
    date: body.date,
    missionName: body.missionName,
    tailNumber: body.tailNumber,
    battery: body.battery,
    startTime: body.startTime,
    endTime: body.endTime,
    batteryStart: Number(body.batteryStart),
    batteryEnd: Number(body.batteryEnd),
    duration: Number(body.duration),
  }

  db.flights.push(newFlight)
  // Update battery last known level
  db.batteries[body.battery] = Number(body.batteryEnd)
  writeDB(db)

  return NextResponse.json(newFlight, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const db = readDB()
  const idx = db.flights.findIndex((f) => f.id === body.id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updated: Flight = {
    ...db.flights[idx],
    pilotId: body.pilotId ?? db.flights[idx].pilotId,
    pilotName: body.pilotName ?? db.flights[idx].pilotName,
    date: body.date ?? db.flights[idx].date,
    missionName: body.missionName ?? db.flights[idx].missionName,
    tailNumber: body.tailNumber ?? db.flights[idx].tailNumber,
    battery: body.battery ?? db.flights[idx].battery,
    startTime: body.startTime ?? db.flights[idx].startTime,
    endTime: body.endTime ?? db.flights[idx].endTime,
    batteryStart: body.batteryStart != null ? Number(body.batteryStart) : db.flights[idx].batteryStart,
    batteryEnd: body.batteryEnd != null ? Number(body.batteryEnd) : db.flights[idx].batteryEnd,
    duration: body.duration != null ? Number(body.duration) : db.flights[idx].duration,
  }
  db.flights[idx] = updated
  db.batteries[updated.battery] = updated.batteryEnd
  writeDB(db)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const db = readDB()
  db.flights = db.flights.filter((f) => f.id !== id)
  writeDB(db)
  return NextResponse.json({ success: true })
}
