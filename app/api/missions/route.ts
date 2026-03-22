import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Mission } from '@/lib/types'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

function parseArray(val: unknown): string[] {
  if (!val) return []
  const s = String(val).trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {}
  return [s]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMission(row: any): Mission {
  return {
    id:            row.id,
    date:          row.date,
    name:          row.name,
    battalion:     parseArray(row.battalion),
    observer:      parseArray(row.observer),
    missionNumber: row.mission_number ?? 1,
    createdAt:     row.created_at    ?? '',
  }
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')

  let query = supabase.from('missions').select('*').order('mission_number')
  if (date) query = query.eq('date', date)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(rowToMission))
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const body = await req.json()
  if (!body.date || !body.name) {
    return NextResponse.json({ error: 'date and name are required' }, { status: 400 })
  }

  // Auto-assign mission_number = count of existing missions on that date + 1
  const { count } = await supabase
    .from('missions')
    .select('*', { count: 'exact', head: true })
    .eq('date', body.date)

  const missionNumber = (count ?? 0) + 1

  const toArr = (v: unknown) => Array.isArray(v) ? v : (v ? [String(v)] : [])
  const record = {
    id:             `ms${Date.now()}`,
    date:           body.date,
    name:           body.name,
    battalion:      JSON.stringify(toArr(body.battalion)),
    observer:       JSON.stringify(toArr(body.observer)),
    mission_number: missionNumber,
  }

  const { data, error } = await supabase.from('missions').insert(record).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rowToMission(data), { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('missions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
