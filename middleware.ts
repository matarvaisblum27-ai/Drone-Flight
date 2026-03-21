import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null

  if (pathname.startsWith('/admin')) {
    if (!session?.isAdmin) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  if (pathname.startsWith('/pilot')) {
    if (!session) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    if (session.isAdmin) {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/pilot/:path*'],
}
