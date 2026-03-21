import { NextRequest, NextResponse } from 'next/server'
import { verifySession, signSession, COOKIE_NAME } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const session = await verifySession(token)
  if (!session) return NextResponse.json({ error: 'session expired' }, { status: 401 })

  // Re-check is_admin from DB in case it was changed
  const { data: pilot } = await supabase
    .from('pilots')
    .select('is_admin, name')
    .eq('id', session.pilotId)
    .maybeSingle()

  if (!pilot) return NextResponse.json({ error: 'pilot not found' }, { status: 401 })

  const isAdmin = pilot.name === ADMIN_NAME
  const isViewer = !isAdmin && pilot.is_admin === true
  const updated = { ...session, isAdmin, isViewer }

  // Refresh the cookie (sliding 30-min window)
  const newToken = await signSession(updated)
  const res = NextResponse.json(updated)
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.cookies.set(COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60,
    path: '/',
  })
  return res
}
