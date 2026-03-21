import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(req)
  if (error) return error

  // Only admin (אורן) and viewers (סגן) can view login logs
  if (!session.isAdmin && !session.isViewer) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data, error: dbError } = await supabase
    .from('login_logs')
    .select('id, pilot_name, success, ip_address, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const res = NextResponse.json(data ?? [])
  res.headers.set('Cache-Control', 'no-store')
  return res
}
