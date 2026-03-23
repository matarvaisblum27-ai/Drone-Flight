import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// ⚠️ Do NOT import from @/lib/auth here.
// lib/auth.ts imports `cookies` from 'next/headers' which is Node.js only.
// Middleware runs in the Edge runtime — importing it crashes the middleware
// silently, letting every request through without any auth check.
// Instead we inline the minimal JWT verification using jose directly.

const COOKIE_NAME = 'session'

// API routes that must be accessible without a session
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/pilots'])

interface SessionPayload {
  isAdmin: boolean
  isViewer: boolean
}

async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? 'drone-flights-default-secret-set-JWT_SECRET-in-env'
    )
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const session = await getSession(req)

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
    // True admin (אורן) must use /admin, not /pilot
    if (session.isAdmin) {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
  }

  // ── API routes: require a valid session (except public endpoints) ────────
  if (pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(pathname)) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  // List both base path and sub-paths explicitly to guarantee matching on all hosts
  matcher: ['/admin', '/admin/:path*', '/pilot', '/pilot/:path*', '/api/:path*'],
}
