import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Flight, FlightDB } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Map a Supabase snake_case row → TypeScript camelCase Flight
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToFlight(row: any): Flight {
  return {
    id:           row.id,
    pilotId:      row.pilot_id,
    pilotName:    row.pilot_name,
    date:         row.date,
    missionName:  row.mission_name,
    tailNumber:   row.tail_number,
    battery:      row.battery,
    startTime:    row.start_time,
    endTime:      row.end_time,
    batteryStart: row.battery_start,
    batteryEnd:   row.battery_end,
    duration:     row.duration,
    observer:     row.observer     ?? '',
    gasDropped:   row.gas_dropped  ?? false,
    gasDropTime:  row.gas_drop_time ?? '',
  }
}

export async function GET() {
  const [pilotsRes, flightsRes, batteriesRes] = await Promise.all([
    supabase.from('pilots').select('*').order('name'),
    supabase.from('flights').select('*').order('date').order('start_time'),
    supabase.from('batteries').select('*'),
  ])

  if (pilotsRes.error)    return NextResponse.json({ error: pilotsRes.error.message },    { status: 500 })
  if (flightsRes.error)   return NextResponse.json({ error: flightsRes.error.message },   { status: 500 })
  if (batteriesRes.error) return NextResponse.json({ error: batteriesRes.error.message }, { status: 500 })

  const batteries: Record<string, number> = {}
  for (const row of batteriesRes.data) batteries[row.label] = row.percentage

  const db: FlightDB = {
    pilots:  pilotsRes.data,
    flights: flightsRes.data.map(rowToFlight),
    batteries,
  }
  return NextResponse.json(db)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const baseRecord = {
    id:            `f${Date.now()}`,
    pilot_id:      body.pilotId,
    pilot_name:    body.pilotName,
    date:          body.date,
    mission_name:  body.missionName,
    tail_number:   body.tailNumber,
    battery:       body.battery,
    start_time:    body.startTime,
    end_time:      body.endTime,
    battery_start: Number(body.batteryStart),
    battery_end:   Number(body.batteryEnd),
    duration:      Number(body.duration),
  }

  // Try with optional new columns; fall back if migration hasn't run yet
  let { data, error } = await supabase
    .from('flights')
    .insert({ ...baseRecord, observer: body.observer ?? '', gas_dropped: body.gasDropped ?? false, gas_drop_time: body.gasDropTime || null })
    .select()
    .single()

  if (error?.message?.includes('column') || error?.message?.includes('schema cache')) {
    const result = await supabase.from('flights').insert(baseRecord).select().single()
    data  = result.data
    error = result.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase
    .from('batteries')
    .upsert({ label: body.battery, percentage: Number(body.batteryEnd) })

  return NextResponse.json(rowToFlight(data), { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()

  const { data: existing, error: fetchErr } = await supabase
    .from('flights').select('*').eq('id', body.id).single()
  if (fetchErr || !existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updates = {
    pilot_id:      body.pilotId     ?? existing.pilot_id,
    pilot_name:    body.pilotName   ?? existing.pilot_name,
    date:          body.date        ?? existing.date,
    mission_name:  body.missionName ?? existing.mission_name,
    tail_number:   body.tailNumber  ?? existing.tail_number,
    battery:       body.battery     ?? existing.battery,
    start_time:    body.startTime   ?? existing.start_time,
    end_time:      body.endTime     ?? existing.end_time,
    battery_start: body.batteryStart != null ? Number(body.batteryStart) : existing.battery_start,
    battery_end:   body.batteryEnd   != null ? Number(body.batteryEnd)   : existing.battery_end,
    duration:      body.duration     != null ? Number(body.duration)     : existing.duration,
    observer:      body.observer     ?? existing.observer     ?? '',
    gas_dropped:   body.gasDropped   ?? existing.gas_dropped  ?? false,
    gas_drop_time: body.gasDropTime  ?? existing.gas_drop_time ?? null,
  }

  let { data, error } = await supabase
    .from('flights').update(updates).eq('id', body.id).select().single()

  if (error?.message?.includes('column') || error?.message?.includes('schema cache')) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { observer, gas_dropped, gas_drop_time, ...baseUpdates } = updates
    const result = await supabase.from('flights').update(baseUpdates).eq('id', body.id).select().single()
    data  = result.data
    error = result.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase
    .from('batteries')
    .upsert({ label: updates.battery, percentage: updates.battery_end })

  return NextResponse.json(rowToFlight(data))
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('flights').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
