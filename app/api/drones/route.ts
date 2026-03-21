import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DroneInfo } from '@/lib/types'

export const dynamic = 'force-dynamic'

const INITIAL_DRONES = [
  { tail_number: '4x-pzk', model: 'מאביק 2',          weight_kg: 4,    serial_number: '4gcck6qr0b0qn7',          extra_registration: null },
  { tail_number: '4x-ulj', model: 'מאביק 3',          weight_kg: 4,    serial_number: '1581f5fjc244q00dwzp2',    extra_registration: null },
  { tail_number: '4x-ulp', model: 'מאביק 3 גלילית',   weight_kg: null, serial_number: '1581f5fjc244h00dpft8',   extra_registration: '1003006' },
  { tail_number: '4x-nxj', model: 'מאטריס 30',        weight_kg: 4,    serial_number: '1581f5bkd239c00fgf60',   extra_registration: null },
  { tail_number: '4x-nyq', model: 'מאטריס 30',        weight_kg: 4,    serial_number: '1581f5bkx25bv00f0fe3',   extra_registration: null },
  { tail_number: '4x-yxb', model: 'מאטריס 300',       weight_kg: 25,   serial_number: '1znbjar00c00l',           extra_registration: null },
  { tail_number: '4x-xtu', model: 'מאטריס 300',       weight_kg: 25,   serial_number: '1znbhbs00c0010',          extra_registration: null },
  { tail_number: '4x-xpg', model: 'מאטריס 600',       weight_kg: 25,   serial_number: '06fdf5g0c10096',          extra_registration: null },
  { tail_number: '4x-ujs', model: 'G3',                weight_kg: 25,   serial_number: '777',                     extra_registration: null },
  { tail_number: '1005254', model: 'אווטה 2',          weight_kg: null, serial_number: '1581F6W8B247500202AE',   extra_registration: null },
  { tail_number: '1005187', model: 'אווטה 2',          weight_kg: null, serial_number: '1581F6W8W255P0020Z7P',   extra_registration: null },
  { tail_number: '1005189', model: 'אווטה 2',          weight_kg: null, serial_number: '1581F6W8W255D0020WHY',   extra_registration: null },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDrone(row: any): DroneInfo {
  return {
    tailNumber:        row.tail_number,
    model:             row.model,
    weightKg:          row.weight_kg ?? null,
    serialNumber:      row.serial_number ?? '',
    extraRegistration: row.extra_registration ?? null,
  }
}

export async function GET() {
  const { data, error } = await supabase.from('drones').select('*').order('model')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.length === 0) {
    const { data: seeded, error: seedErr } = await supabase.from('drones').insert(INITIAL_DRONES).select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(seeded.map(rowToDrone))
  }

  return NextResponse.json(data.map(rowToDrone))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tailNumber, model, weightKg, serialNumber, extraRegistration } = body
  if (!tailNumber || !model) return NextResponse.json({ error: 'tailNumber and model required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drones')
    .insert({ tail_number: tailNumber, model, weight_kg: weightKg ?? null, serial_number: serialNumber ?? '', extra_registration: extraRegistration || null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(rowToDrone(data), { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const tailNumber = req.nextUrl.searchParams.get('tailNumber')
  if (!tailNumber) return NextResponse.json({ error: 'tailNumber required' }, { status: 400 })
  const { error } = await supabase.from('drones').delete().eq('tail_number', tailNumber)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { tailNumber, model, weightKg, serialNumber, extraRegistration } = body
  if (!tailNumber) return NextResponse.json({ error: 'tailNumber required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drones')
    .update({
      model,
      weight_kg:          weightKg ?? null,
      serial_number:      serialNumber ?? '',
      extra_registration: extraRegistration || null,
    })
    .eq('tail_number', tailNumber)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToDrone(data))
}
