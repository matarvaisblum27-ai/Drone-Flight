import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DroneInfo } from '@/lib/types'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

const INITIAL_DRONES = [
  { tail_number: '4x-pzk',  model_name: 'מאביק 2',        weight: '4',  serial_number: '4gcck6qr0b0qn7',        extra_registration: null },
  { tail_number: '4x-ulj',  model_name: 'מאביק 3',        weight: '4',  serial_number: '1581f5fjc244q00dwzp2',  extra_registration: null },
  { tail_number: '4x-ulp',  model_name: 'מאביק 3 גלילית', weight: null, serial_number: '1581f5fjc244h00dpft8', extra_registration: '1003006' },
  { tail_number: '4x-nxj',  model_name: 'מאטריס 30',      weight: '4',  serial_number: '1581f5bkd239c00fgf60',  extra_registration: null },
  { tail_number: '4x-nyq',  model_name: 'מאטריס 30',      weight: '4',  serial_number: '1581f5bkx25bv00f0fe3',  extra_registration: null },
  { tail_number: '4x-yxb',  model_name: 'מאטריס 300',     weight: '25', serial_number: '1znbjar00c00l',         extra_registration: null },
  { tail_number: '4x-xtu',  model_name: 'מאטריס 300',     weight: '25', serial_number: '1znbhbs00c0010',        extra_registration: null },
  { tail_number: '4x-xpg',  model_name: 'מאטריס 600',     weight: '25', serial_number: '06fdf5g0c10096',        extra_registration: null },
  { tail_number: '4x-ujs',  model_name: 'G3',              weight: '25', serial_number: '777',                   extra_registration: null },
  { tail_number: '1005254', model_name: 'אווטה 2',         weight: null, serial_number: '1581F6W8B247500202AE', extra_registration: null },
  { tail_number: '1005187', model_name: 'אווטה 2',         weight: null, serial_number: '1581F6W8W255P0020Z7P', extra_registration: null },
  { tail_number: '1005189', model_name: 'אווטה 2',         weight: null, serial_number: '1581F6W8W255D0020WHY', extra_registration: null },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDrone(row: any): DroneInfo {
  return {
    tailNumber:        row.tail_number,
    model:             row.model_name,
    weightKg:          row.weight != null ? Number(row.weight) : null,
    serialNumber:      row.serial_number ?? '',
    extraRegistration: row.extra_registration ?? null,
  }
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const { data, error } = await supabase.from('drones').select('*').order('model_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const CACHE = { headers: { 'Cache-Control': 'private, max-age=180, stale-while-revalidate=60' } }

  if (data.length === 0) {
    const { data: seeded, error: seedErr } = await supabase.from('drones').insert(INITIAL_DRONES).select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(seeded.map(rowToDrone), CACHE)
  }

  return NextResponse.json(data.map(rowToDrone), CACHE)
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const body = await req.json()
  const { tailNumber, model, weightKg, serialNumber, extraRegistration } = body
  if (!tailNumber || !model) return NextResponse.json({ error: 'tailNumber and model required' }, { status: 400 })

  // Check for duplicate tail_number
  const { data: existing } = await supabase.from('drones').select('tail_number').eq('tail_number', tailNumber).maybeSingle()
  if (existing) return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 })

  const { data, error } = await supabase
    .from('drones')
    .insert({
      tail_number:        tailNumber,
      model_name:         model,
      weight:             weightKg != null ? String(weightKg) : null,
      serial_number:      serialNumber ?? '',
      extra_registration: extraRegistration || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToDrone(data), { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const tailNumber = req.nextUrl.searchParams.get('tailNumber')
  if (!tailNumber) return NextResponse.json({ error: 'tailNumber required' }, { status: 400 })

  const { error, count } = await supabase
    .from('drones')
    .delete({ count: 'exact' })
    .eq('tail_number', tailNumber)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: 'drone_not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const body = await req.json()
  const { tailNumber, model, weightKg, serialNumber, extraRegistration } = body
  if (!tailNumber) return NextResponse.json({ error: 'tailNumber required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drones')
    .update({
      model_name:         model,
      weight:             weightKg != null ? String(weightKg) : null,
      serial_number:      serialNumber ?? '',
      extra_registration: extraRegistration || null,
    })
    .eq('tail_number', tailNumber)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToDrone(data))
}
