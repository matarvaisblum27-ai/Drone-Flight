import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME, SessionPayload } from './auth'

type Result =
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse }

/** Verify the session cookie in a route handler. Returns the session or a ready-made error response. */
export async function requireSession(req: NextRequest): Promise<Result> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return { session: null, error: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  }
  const session = await verifySession(token)
  if (!session) {
    return { session: null, error: NextResponse.json({ error: 'session_expired' }, { status: 401 }) }
  }
  return { session, error: null }
}
