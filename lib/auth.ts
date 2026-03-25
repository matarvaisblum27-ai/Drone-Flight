import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_DURATION = '8h'
const COOKIE_NAME = 'session'

function getSecret(): Uint8Array {
  // Fallback keeps the app running even if env var is not set (sessions won't persist across restarts)
  const secret = process.env.JWT_SECRET ?? 'drone-flights-default-secret-set-JWT_SECRET-in-env'
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  pilotId: string
  name: string
  isAdmin: boolean   // true ONLY for אורן וייסבלום (hardcoded)
  isViewer: boolean  // true for pilots granted "הרשאת סגן" (is_admin=true in DB)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(SESSION_DURATION)
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

/** Read session from the request cookie (server components / route handlers) */
export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export { COOKIE_NAME }
