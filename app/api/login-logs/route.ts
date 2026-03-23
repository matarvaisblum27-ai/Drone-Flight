import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/requireSession'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(req)
  if (error) return error

  // Only admin (אורן) can view login logs
  if (!session.isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))

  // Total count (for "load more" logic)
  const { count } = await supabase
    .from('login_logs')
    .select('id', { count: 'exact', head: true })

  const { data, error: dbError } = await supabase
    .from('login_logs')
    .select('id, pilot_name, success, ip_address, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const res = NextResponse.json({ logs: data ?? [], total: count ?? 0 })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
