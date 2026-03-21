import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { signSession, COOKIE_NAME } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'
const LEGACY_ADMIN_PASSWORD = 'oren3004'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = body.name?.trim() ?? ''
  const password = body.password ?? ''

  if (!name || !password) {
    return NextResponse.json({ error: 'name and password required' }, { status: 400 })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const { data: pilot } = await supabase
    .from('pilots')
    .select('*')
    .eq('name', name)
    .maybeSingle()

  const logAttempt = (success: boolean) =>
    supabase.from('login_logs').insert({ pilot_name: name, success, ip_address: ip })

  if (!pilot) {
    await logAttempt(false)
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
  }

  // Validate password — prefer hashed; fall back to legacy plaintext for admin
  let valid = false
  if (pilot.password_hash) {
    valid = await bcrypt.compare(password, pilot.password_hash)
  } else if (pilot.name === ADMIN_NAME && password === LEGACY_ADMIN_PASSWORD) {
    valid = true
  }

  if (!valid) {
    await logAttempt(false)
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
  }

  await logAttempt(true)

  const isAdmin = pilot.name === ADMIN_NAME || pilot.is_admin === true

  const token = await signSession({ pilotId: pilot.id, name: pilot.name, isAdmin })

  const res = NextResponse.json({ ok: true, name: pilot.name, isAdmin })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60, // 30 minutes
    path: '/',
  })
  return res
}
