import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { signSession, COOKIE_NAME } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'
const LEGACY_ADMIN_PASSWORD = 'oren3004'

// Rate limit: max failed attempts per IP in the blocking window
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function logAttempt(pilotName: string, success: boolean, ip: string) {
  // Fire-and-forget — never block login if logging fails
  void supabase.from('login_logs')
    .insert({ pilot_name: pilotName, success, ip_address: ip, created_at: new Date().toISOString() })
}

async function isRateLimited(ip: string): Promise<boolean> {
  if (ip === 'unknown') return false // can't rate-limit unknown IPs

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count, error } = await supabase
    .from('login_logs')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('success', false)
    .gte('created_at', windowStart)

  if (error) return false // fail open — don't block if query fails
  return (count ?? 0) >= RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = (body.name ?? '').trim()
    const password = body.password ?? ''

    if (!name || !password) {
      return NextResponse.json({ error: 'name and password required' }, { status: 400 })
    }

    // Enforce max lengths to prevent abuse
    if (name.length > 100 || password.length > 200) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    // Check rate limit BEFORE DB query (Supabase-backed, works on serverless)
    if (await isRateLimited(ip)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const { data: pilot, error: pilotErr } = await supabase
      .from('pilots')
      .select('*')
      .eq('name', name)
      .maybeSingle()

    if (pilotErr) {
      console.error('pilots query error:', pilotErr.message)
      return NextResponse.json({ error: 'database_error' }, { status: 500 })
    }

    if (!pilot) {
      logAttempt(name, false, ip)
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
      logAttempt(name, false, ip)
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    logAttempt(name, true, ip)

    const isAdmin = pilot.name === ADMIN_NAME
    const isViewer = !isAdmin && pilot.is_admin === true  // granted "הרשאת סגן"

    console.log('[login] pilot DB data:', { name: pilot.name, is_admin: pilot.is_admin })
    console.log('[login] computed permissions:', { isAdmin, isViewer })

    const token = await signSession({ pilotId: pilot.id, name: pilot.name, isAdmin, isViewer })

    const res = NextResponse.json({ ok: true, name: pilot.name, isAdmin, isViewer })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })
    return res
  } catch (err) {
    console.error('login route error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
