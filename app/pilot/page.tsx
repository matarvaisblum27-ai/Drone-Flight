// SERVER COMPONENT — auth check runs server-side before any HTML is sent.
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import PilotDashboard from './PilotDashboard'

export const dynamic = 'force-dynamic'

export default async function PilotPage() {
  const session = await getServerSession()

  if (!session) redirect('/')

  // True admin should use /admin
  if (session.isAdmin) redirect('/admin')

  return <PilotDashboard />
}
