import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DroneBattery } from '@/lib/types'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

const INITIAL_BATTERIES = [
  { drone_tail_number: '4x-nxj', battery_name: 'סט 1',    charge_cycle: '287-282', inspection_date: '16.4.25' },
  { drone_tail_number: '4x-nxj', battery_name: 'סט 2',    charge_cycle: '268-257', inspection_date: '16.4.25' },
  { drone_tail_number: '4x-nxj', battery_name: 'סט A',    charge_cycle: '105-129', inspection_date: '16.4.25' },
  { drone_tail_number: '4x-nyq', battery_name: 'סט 13',   charge_cycle: '233-149', inspection_date: '16.4.25' },
  { drone_tail_number: '4x-nyq', battery_name: 'סט 2',    charge_cycle: '237-223', inspection_date: '16.4.25' },
  { drone_tail_number: '4x-nyq', battery_name: 'סט 3',    charge_cycle: '231-272', inspection_date: '16.4.25' },
  { drone_tail_number: '4x-nyq', battery_name: 'סט גיבוי', charge_cycle: '223-169', inspection_date: null },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBattery(row: any): DroneBattery {
  return {
    id:              row.id,
    droneTailNumber: row.drone_tail_number,
    batteryName:     row.battery_name,
    chargeCycle:     row.charge_cycle ?? '',
    inspectionDate:  row.inspection_date ?? '',
  }
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const { data, error } = await supabase
    .from('drone_batteries').select('*').order('drone_tail_number').order('battery_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const CACHE = { headers: { 'Cache-Control': 'private, max-age=180, stale-while-revalidate=60' } }

  if (data.length === 0) {
    const { data: seeded, error: seedErr } = await supabase
      .from('drone_batteries').insert(INITIAL_BATTERIES).select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(seeded.map(rowToBattery), CACHE)
  }

  return NextResponse.json(data.map(rowToBattery), CACHE)
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const body = await req.json()
  const { droneTailNumber, batteryName, chargeCycle, inspectionDate } = body
  if (!droneTailNumber || !batteryName)
    return NextResponse.json({ error: 'droneTailNumber and batteryName required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drone_batteries')
    .insert({ drone_tail_number: droneTailNumber, battery_name: batteryName, charge_cycle: chargeCycle || null, inspection_date: inspectionDate || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToBattery(data), { status: 201 })
}

export async function PUT(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const body = await req.json()
  const { id, batteryName, chargeCycle, inspectionDate } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drone_batteries')
    .update({ battery_name: batteryName, charge_cycle: chargeCycle || null, inspection_date: inspectionDate || null })
    .eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToBattery(data))
}

export async function DELETE(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('drone_batteries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
