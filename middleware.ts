import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/auth'

// API routes that must be accessible without a session
// /api/pilots is fetched by the login page before any session exists (pilot name dropdown)
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/pilots'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null

  // ── Page routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!session?.isAdmin && !session?.isViewer) {
      return NextResponse.redirect(new URL(session ? '/pilot' : '/', req.url))
    }
  }

  if (pathname.startsWith('/pilot')) {
    if (!session) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    // Only true admin (אורן) cannot access /pilot; viewers CAN (to log their own flights)
    if (session.isAdmin) {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
  }

  // ── API routes: require a valid session (except login / logout) ──────────
  if (pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(pathname)) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  // Use (.*) so /admin and /pilot themselves (no trailing slash) are also matched
  matcher: ['/admin(.*)', '/pilot(.*)', '/api/(.*)'],
}
