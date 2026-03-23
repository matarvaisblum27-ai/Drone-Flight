import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/requireSession'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(req)
  if (error) return error

  // Re-check is_admin from DB in case permissions changed since token was issued
  const { data: pilot } = await supabase
    .from('pilots')
    .select('name, is_admin')
    .eq('id', session.pilotId)
    .maybeSingle()

  if (!pilot) return NextResponse.json({ error: 'pilot_not_found' }, { status: 401 })

  const isAdmin = pilot.name === ADMIN_NAME
  const isViewer = !isAdmin && pilot.is_admin === true

  const res = NextResponse.json({ valid: true, isAdmin, isViewer, name: pilot.name })
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return res
}
