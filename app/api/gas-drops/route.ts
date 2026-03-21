import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GasDrop } from '@/lib/types'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGasDrop(row: any): GasDrop {
  return {
    id:          row.id,
    pilotName:   row.pilot_name,
    date:        row.date,
    tailNumber:  row.tail_number,
    gasDropTime: row.gas_drop_time ?? '',
    notes:       row.notes ?? '',
  }
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const { data, error } = await supabase
    .from('gas_drops').select('*').order('date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data.map(rowToGasDrop))
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const body = await req.json()
  const { pilotName, date, tailNumber, gasDropTime, notes } = body
  if (!pilotName || !date || !tailNumber)
    return NextResponse.json({ error: 'pilotName, date, tailNumber required' }, { status: 400 })

  const { data, error } = await supabase
    .from('gas_drops')
    .insert({ pilot_name: pilotName, date, tail_number: tailNumber, gas_drop_time: gasDropTime || null, notes: notes || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToGasDrop(data), { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('gas_drops').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
