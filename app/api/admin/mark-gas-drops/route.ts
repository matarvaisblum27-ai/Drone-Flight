import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// The 6 known historical gas drop flights to back-fill
const GAS_DROP_TARGETS = [
  { pilot_name: 'אורן וייסבלום',  date: '2026-02-15', tail_number: '4x-xpg' },
  { pilot_name: 'ישראל חסדאי',    date: '2026-02-08', tail_number: '4x-ujs' },
  { pilot_name: 'באשיר פיראס',    date: '2025-10-21', tail_number: '4x-ujs' },
  { pilot_name: 'גל בן עזרא',     date: '2015-11-02', tail_number: '4x-ujs' },
  { pilot_name: 'האדי עזאם',      date: '2025-10-15', tail_number: '4x-xpg' },
  { pilot_name: "אביב תורג'מן",   date: '2025-11-09', tail_number: '4x-xpg' },
]

export async function POST() {
  const results: { pilot: string; date: string; action: string; error?: string }[] = []

  for (const target of GAS_DROP_TARGETS) {
    // Search for matching flight
    const { data: matches } = await supabase
      .from('flights')
      .select('id, gas_dropped')
      .eq('pilot_name', target.pilot_name)
      .eq('date', target.date)
      .eq('tail_number', target.tail_number)

    if (matches && matches.length > 0) {
      const flight = matches[0]
      if (flight.gas_dropped) {
        results.push({ pilot: target.pilot_name, date: target.date, action: 'already_marked' })
      } else {
        const { error } = await supabase
          .from('flights').update({ gas_dropped: true }).eq('id', flight.id)
        results.push({ pilot: target.pilot_name, date: target.date, action: error ? 'error' : 'updated_flight', error: error?.message })
      }
    } else {
      // Flight not found — add to standalone gas_drops table
      // Skip if already there
      const { data: existing } = await supabase
        .from('gas_drops')
        .select('id')
        .eq('pilot_name', target.pilot_name)
        .eq('date', target.date)
        .eq('tail_number', target.tail_number)

      if (existing && existing.length > 0) {
        results.push({ pilot: target.pilot_name, date: target.date, action: 'standalone_exists' })
      } else {
        const { error } = await supabase
          .from('gas_drops')
          .insert({ pilot_name: target.pilot_name, date: target.date, tail_number: target.tail_number })
        results.push({ pilot: target.pilot_name, date: target.date, action: error ? 'error' : 'added_standalone', error: error?.message })
      }
    }
  }

  const updated   = results.filter(r => r.action === 'updated_flight').length
  const added     = results.filter(r => r.action === 'added_standalone').length
  const skipped   = results.filter(r => r.action.includes('already') || r.action.includes('exists')).length
  const errors    = results.filter(r => r.action === 'error')

  return NextResponse.json({ results, summary: { updated, added, skipped, errors: errors.length } })
}
