// SERVER COMPONENT — runs on the server before any HTML is sent to the browser.
// getServerSession() reads the httpOnly cookie and verifies the JWT entirely
// server-side. Unauthenticated / unauthorized requests are redirected with a
// 302 before any dashboard HTML is ever generated or transmitted.
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import AdminDashboard from './AdminDashboard'

// force-dynamic prevents Vercel from caching this response at the CDN edge.
// Every request triggers a fresh server render + auth check.
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getServerSession()

  // No cookie, expired token, or invalid JWT → send to login
  if (!session) redirect('/')

  // Regular pilot somehow reached /admin → send to their dashboard
  if (!session.isAdmin && !session.isViewer) redirect('/')

  // Auth passed — render the client component dashboard
  return <AdminDashboard />
}
