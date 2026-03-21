import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'

/**
 * Pure DB permission check — never trusts JWT-cached is_admin.
 * Called on every admin/pilot page load to detect real-time permission changes.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const session = await verifySession(token)
  if (!session) {
    return NextResponse.json({ error: 'session_expired' }, { status: 401 })
  }

  // Always read is_admin fresh from Supabase — never use the JWT-cached value
  const { data: pilot, error } = await supabase
    .from('pilots')
    .select('name, is_admin')
    .eq('id', session.pilotId)
    .maybeSingle()

  if (error || !pilot) {
    return NextResponse.json({ error: 'pilot_not_found' }, { status: 401 })
  }

  const isAdmin = pilot.name === ADMIN_NAME
  const isViewer = !isAdmin && pilot.is_admin === true

  const res = NextResponse.json({ name: pilot.name, isAdmin, isViewer })
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.headers.set('Pragma', 'no-cache')
  return res
}
