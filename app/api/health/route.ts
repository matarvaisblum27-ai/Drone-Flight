import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({
      ok: false,
      error: 'Missing environment variables',
      missing: [
        !url && 'NEXT_PUBLIC_SUPABASE_URL',
        !key && 'SUPABASE_SERVICE_ROLE_KEY',
      ].filter(Boolean),
      fix: 'Add these to Vercel: Project → Settings → Environment Variables',
    }, { status: 500 })
  }

  try {
    const { supabase } = await import('@/lib/supabase')
    const { count: pilotCount, error: pe } = await supabase
      .from('pilots').select('*', { count: 'exact', head: true })
    const { count: flightCount, error: fe } = await supabase
      .from('flights').select('*', { count: 'exact', head: true })

    if (pe || fe) {
      return NextResponse.json({
        ok: false,
        error: pe?.message ?? fe?.message,
        hint: pe?.hint ?? fe?.hint,
        fix: 'Run scripts/seed.sql in Supabase SQL Editor to create tables',
      }, { status: 500 })
    }

    return NextResponse.json({ ok: true, pilots: pilotCount, flights: flightCount })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
