import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

/** Normalise a name for comparison — must stay in sync with normName() in the UI. */
function normName(s: string): string {
  return (s ?? '')
    .replace(/[‎‏‪-‮ ]/g, ' ')
    .replace(/[.'"׳״`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Repairs flights whose `pilot_id` no longer points at the pilot named in
 * `pilot_name`. This happened when a pilot row was recreated/renamed: the
 * commander's views match on name so the flights still showed up for him, but
 * the pilot's own dashboard filters on id and saw nothing.
 *
 * GET  → dry run, reports what WOULD change (safe to call any time).
 * POST → performs the update.
 */
async function analyse() {
  const [{ data: pilots, error: pErr }, { data: flights, error: fErr }] = await Promise.all([
    supabase.from('pilots').select('id,name'),
    supabase.from('flights').select('id,pilot_id,pilot_name').limit(50000),
  ])
  if (pErr) throw new Error(pErr.message)
  if (fErr) throw new Error(fErr.message)

  const byNorm = new Map<string, { id: string; name: string }[]>()
  for (const p of pilots ?? []) {
    const k = normName(p.name)
    if (!byNorm.has(k)) byNorm.set(k, [])
    byNorm.get(k)!.push(p)
  }
  const validIds = new Set((pilots ?? []).map(p => p.id))

  const fixes: { id: string; pilotName: string; from: string; to: string }[] = []
  const unmatched: string[] = []

  for (const f of flights ?? []) {
    const candidates = byNorm.get(normName(f.pilot_name ?? '')) ?? []
    // Only act when the name maps to exactly ONE pilot — never guess.
    if (candidates.length !== 1) {
      if (candidates.length === 0 && !validIds.has(f.pilot_id)) unmatched.push(f.pilot_name ?? '(ריק)')
      continue
    }
    const target = candidates[0]
    if (f.pilot_id !== target.id) {
      fixes.push({ id: f.id, pilotName: target.name, from: f.pilot_id, to: target.id })
    }
  }

  const perPilot: Record<string, number> = {}
  fixes.forEach(x => { perPilot[x.pilotName] = (perPilot[x.pilotName] || 0) + 1 })

  return { fixes, perPilot, unmatched: Array.from(new Set(unmatched)), scanned: flights?.length ?? 0 }
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  try {
    const { fixes, perPilot, unmatched, scanned } = await analyse()
    return NextResponse.json({ dryRun: true, scanned, wouldFix: fixes.length, perPilot, unmatched })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireSession(req)
  if (authError) return authError
  try {
    const { fixes, perPilot, unmatched, scanned } = await analyse()

    let updated = 0
    let errors = 0
    // Group by target id so we can update in batches instead of row-by-row.
    const byTarget = new Map<string, string[]>()
    fixes.forEach(x => {
      if (!byTarget.has(x.to)) byTarget.set(x.to, [])
      byTarget.get(x.to)!.push(x.id)
    })

    for (const [targetId, ids] of Array.from(byTarget.entries())) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const { error } = await supabase.from('flights').update({ pilot_id: targetId }).in('id', chunk)
        if (error) errors += chunk.length
        else updated += chunk.length
      }
    }

    return NextResponse.json({ scanned, updated, errors, perPilot, unmatched })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
