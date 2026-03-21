import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DroneBattery } from '@/lib/types'

export const dynamic = 'force-dynamic'

const INITIAL_BATTERIES = [
  { tail_number: '4x-nxj', set_name: 'סט 1',    cycle_1: 287, cycle_2: 282, inspection_date: '16.4.25' },
  { tail_number: '4x-nxj', set_name: 'סט 2',    cycle_1: 268, cycle_2: 257, inspection_date: '16.4.25' },
  { tail_number: '4x-nxj', set_name: 'סט A',    cycle_1: 105, cycle_2: 129, inspection_date: '16.4.25' },
  { tail_number: '4x-nyq', set_name: 'סט 13',   cycle_1: 233, cycle_2: 149, inspection_date: '16.4.25' },
  { tail_number: '4x-nyq', set_name: 'סט 2',    cycle_1: 237, cycle_2: 223, inspection_date: '16.4.25' },
  { tail_number: '4x-nyq', set_name: 'סט 3',    cycle_1: 231, cycle_2: 272, inspection_date: '16.4.25' },
  { tail_number: '4x-nyq', set_name: 'סט גיבוי', cycle_1: 223, cycle_2: 169, inspection_date: null },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBattery(row: any): DroneBattery {
  return {
    id:             row.id,
    tailNumber:     row.tail_number,
    setName:        row.set_name,
    cycle1:         row.cycle_1 ?? null,
    cycle2:         row.cycle_2 ?? null,
    inspectionDate: row.inspection_date ?? '',
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('drone_batteries').select('*').order('tail_number').order('set_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.length === 0) {
    const { data: seeded, error: seedErr } = await supabase.from('drone_batteries').insert(INITIAL_BATTERIES).select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(seeded.map(rowToBattery))
  }

  return NextResponse.json(data.map(rowToBattery))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tailNumber, setName, cycle1, cycle2, inspectionDate } = body
  if (!tailNumber || !setName) return NextResponse.json({ error: 'tailNumber and setName required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drone_batteries')
    .insert({ tail_number: tailNumber, set_name: setName, cycle_1: cycle1 ?? null, cycle_2: cycle2 ?? null, inspection_date: inspectionDate || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToBattery(data), { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, setName, cycle1, cycle2, inspectionDate } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drone_batteries')
    .update({ set_name: setName, cycle_1: cycle1 ?? null, cycle_2: cycle2 ?? null, inspection_date: inspectionDate || null })
    .eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToBattery(data))
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('drone_batteries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
