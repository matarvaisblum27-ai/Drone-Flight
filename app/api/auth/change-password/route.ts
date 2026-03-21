import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifySession, COOKIE_NAME } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const session = await verifySession(token)
  if (!session) return NextResponse.json({ error: 'session expired' }, { status: 401 })

  const body = await req.json()
  const { currentPassword, newPassword, targetPilotId } = body

  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: 'סיסמה חדשה חייבת להכיל לפחות 4 תווים' }, { status: 400 })
  }

  // Admin can set/change any pilot's password without requiring current password
  if (targetPilotId && session.isAdmin && targetPilotId !== session.pilotId) {
    const hash = await bcrypt.hash(newPassword, 12)
    const { error } = await supabase.from('pilots').update({ password_hash: hash }).eq('id', targetPilotId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // User changing their own password — must provide current password
  const { data: pilot } = await supabase
    .from('pilots')
    .select('password_hash, name')
    .eq('id', session.pilotId)
    .single()

  if (!pilot) return NextResponse.json({ error: 'pilot not found' }, { status: 404 })

  const LEGACY_ADMIN_PASSWORD = 'oren3004'
  const ADMIN_NAME = 'אורן וייסבלום'

  let currentValid = false
  if (pilot.password_hash) {
    currentValid = await bcrypt.compare(currentPassword ?? '', pilot.password_hash)
  } else if (pilot.name === ADMIN_NAME && currentPassword === LEGACY_ADMIN_PASSWORD) {
    currentValid = true
  }

  if (!currentValid) {
    return NextResponse.json({ error: 'סיסמה נוכחית שגויה' }, { status: 400 })
  }

  const hash = await bcrypt.hash(newPassword, 12)
  const { error } = await supabase.from('pilots').update({ password_hash: hash }).eq('id', session.pilotId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
