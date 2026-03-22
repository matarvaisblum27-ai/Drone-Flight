import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const RENAMES: Record<string, string> = {
  'גדוד מודיעין': 'מודיעין',
  'גדוד כללי':    'כללי',
}

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

export async function POST() {
  // Fetch every flight that still has an old battalion name in its JSON string
  const conditions = Object.keys(RENAMES).map(old => `battalion.like.%${old}%`).join(',')
  const { data, error } = await supabase
    .from('flights')
    .select('id, battalion')
    .or(conditions)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ updated: 0 })

  let updated = 0
  let errors  = 0
  for (const row of data) {
    const arr     = parseArray(row.battalion)
    const renamed = arr.map(b => RENAMES[b] ?? b)
    const { error: upErr } = await supabase
      .from('flights')
      .update({ battalion: JSON.stringify(renamed) })
      .eq('id', row.id)
    if (upErr) errors++
    else updated++
  }

  return NextResponse.json({ updated, errors, total: data.length })
}
