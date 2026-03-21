import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null

  if (pathname.startsWith('/admin')) {
    // Allow admin (אורן) and סגן; redirect others based on whether they're logged in
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

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/pilot/:path*'],
}
