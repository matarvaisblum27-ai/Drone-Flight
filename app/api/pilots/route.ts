import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { FlightDB, Pilot } from '@/lib/types'

const DB_PATH = path.join(process.cwd(), 'data', 'flights.json')
const ADMIN_NAME = 'אורן וייסבלום'

function readDB(): FlightDB {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
}
function writeDB(db: FlightDB) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

export async function GET() {
  const db = readDB()
  return NextResponse.json(db.pilots)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = body.name?.trim()
  const license = body.license?.trim()
  if (!name || !license) {
    return NextResponse.json({ error: 'name and license required' }, { status: 400 })
  }
  const db = readDB()
  if (db.pilots.some(p => p.name === name)) {
    return NextResponse.json({ error: 'pilot with this name already exists' }, { status: 409 })
  }
  const newPilot: Pilot = { id: `p${Date.now()}`, name, license }
  db.pilots.push(newPilot)
  writeDB(db)
  return NextResponse.json(newPilot, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const name = body.name?.trim()
  const license = body.license?.trim()
  if (!body.id || !name || !license) {
    return NextResponse.json({ error: 'id, name and license required' }, { status: 400 })
  }
  const db = readDB()
  const idx = db.pilots.findIndex(p => p.id === body.id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const oldName = db.pilots[idx].name
  db.pilots[idx] = { ...db.pilots[idx], name, license }

  // Keep flight records in sync if name changed
  if (oldName !== name) {
    db.flights = db.flights.map(f =>
      f.pilotId === body.id ? { ...f, pilotName: name } : f
    )
  }
  writeDB(db)
  return NextResponse.json(db.pilots[idx])
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const db = readDB()

  const target = db.pilots.find(p => p.id === id)
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (target.name === ADMIN_NAME) {
    return NextResponse.json({ error: 'cannot delete admin' }, { status: 403 })
  }

  db.pilots = db.pilots.filter(p => p.id !== id)
  writeDB(db)
  return NextResponse.json({ success: true })
}
