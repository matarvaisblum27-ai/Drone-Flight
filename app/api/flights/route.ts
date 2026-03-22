import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Flight, FlightDB } from '@/lib/types'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToFlight(row: any): Flight {
  return {
    id:          row.id,
    pilotId:     row.pilot_id,
    pilotName:   row.pilot_name,
    date:        row.date,
    missionName: row.mission_name  ?? '',
    missionId:   row.mission_id    ?? undefined,
    tailNumber:  row.tail_number   ?? '',
    battery:     row.battery       ?? '',
    startTime:   row.start_time    ?? '',
    endTime:     row.end_time      ?? '',
    duration:    row.duration      ?? 0,
    observer:    row.observer      ?? '',
    gasDropped:  row.gas_dropped   ?? false,
    eventNumber: row.gas_drop_time ?? '',  // reuse existing column for event number
    battalion:   row.battalion     ?? '',
  }
}

async function hasMigration(): Promise<boolean> {
  const { error } = await supabase.from('flights').select('observer').limit(1)
  return !error
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const [pilotsRes, flightsRes, batteriesRes, migrated] = await Promise.all([
    supabase.from('pilots').select('*').order('name'),
    supabase.from('flights').select('*').order('date').order('start_time'),
    supabase.from('batteries').select('*'),
    hasMigration(),
  ])

  if (pilotsRes.error)    return NextResponse.json({ error: pilotsRes.error.message },    { status: 500 })
  if (flightsRes.error)   return NextResponse.json({ error: flightsRes.error.message },   { status: 500 })
  if (batteriesRes.error) return NextResponse.json({ error: batteriesRes.error.message }, { status: 500 })

  const batteries: Record<string, number> = {}
  for (const row of batteriesRes.data) batteries[row.label] = row.percentage

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapPilot = (row: any) => ({ id: row.id, name: row.name, license: row.license, isAdmin: row.is_admin ?? false })

  const db: FlightDB = {
    pilots:          pilotsRes.data.map(mapPilot),
    flights:         flightsRes.data.map(rowToFlight),
    batteries,
    migrationNeeded: !migrated,
  }
  return NextResponse.json(db)
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const body = await req.json()

  if (!(await hasMigration())) {
    return NextResponse.json({
      error: 'DB_MIGRATION_NEEDED',
      message: 'עמודות observer/gas_dropped/gas_drop_time חסרות בטבלת flights.',
    }, { status: 500 })
  }

  // Only pilotId and date are required
  if (!body.pilotId || !body.date) {
    return NextResponse.json({ error: 'pilotId and date are required' }, { status: 400 })
  }

  const startTime = body.startTime ?? ''
  const endTime   = body.endTime   ?? ''
  const duration  = startTime && endTime ? (Number(body.duration) || 0) : 0

  const record = {
    id:            `f${Date.now()}`,
    pilot_id:      body.pilotId,
    pilot_name:    body.pilotName,
    date:          body.date,
    mission_name:  body.missionName  ?? '',
    mission_id:    body.missionId    ?? null,
    tail_number:   body.tailNumber   ?? '',
    battery:       body.battery      ?? '',
    start_time:    startTime,
    end_time:      endTime,
    battery_start: 0,
    battery_end:   0,
    duration,
    observer:      body.observer     ?? '',
    gas_dropped:   body.gasDropped   ?? false,
    gas_drop_time: body.eventNumber  || null,
    battalion:     body.battalion    ?? '',
  }

  const { data, error } = await supabase.from('flights').insert(record).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToFlight(data), { status: 201 })
}

export async function PUT(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const body = await req.json()

  const { data: existing, error: fetchErr } = await supabase
    .from('flights').select('*').eq('id', body.id).single()
  if (fetchErr || !existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const migrated = await hasMigration()

  const startTime = body.startTime ?? existing.start_time ?? ''
  const endTime   = body.endTime   ?? existing.end_time   ?? ''
  const duration  = startTime && endTime
    ? (body.duration != null ? Number(body.duration) : existing.duration ?? 0)
    : 0

  const updates: Record<string, unknown> = {
    pilot_id:      body.pilotId     ?? existing.pilot_id,
    pilot_name:    body.pilotName   ?? existing.pilot_name,
    date:          body.date        ?? existing.date,
    mission_name:  body.missionName ?? existing.mission_name ?? '',
    mission_id:    body.missionId   !== undefined ? (body.missionId || null) : (existing.mission_id ?? null),
    tail_number:   body.tailNumber  ?? existing.tail_number  ?? '',
    battery:       body.battery     ?? existing.battery      ?? '',
    start_time:    startTime,
    end_time:      endTime,
    battery_start: 0,
    battery_end:   0,
    duration,
  }

  if (migrated) {
    updates.observer      = body.observer    ?? existing.observer     ?? ''
    updates.gas_dropped   = body.gasDropped  ?? existing.gas_dropped  ?? false
    updates.gas_drop_time = body.eventNumber !== undefined
      ? (body.eventNumber || null)
      : (existing.gas_drop_time ?? null)
  }
  updates.battalion = body.battalion !== undefined ? body.battalion : (existing.battalion ?? '')

  const { data, error } = await supabase
    .from('flights').update(updates).eq('id', body.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToFlight(data))
}

export async function DELETE(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('flights').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
