import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Pilot } from '@/lib/types'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPilot(row: any): Pilot {
  return { id: row.id, name: row.name, license: row.license, isAdmin: row.is_admin ?? false }
}

export async function GET() {
  const { data, error } = await supabase
    .from('pilots')
    .select('id, name, license, is_admin')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(rowToPilot))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = body.name?.trim()
  const license = body.license?.trim()
  const password = body.password ?? ''
  if (!name || !license) {
    return NextResponse.json({ error: 'name and license required' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'password is required' }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  const { data, error } = await supabase
    .from('pilots')
    .insert({ id: `p${Date.now()}`, name, license, password_hash, is_admin: false })
    .select('id, name, license, is_admin')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'pilot with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(rowToPilot(data), { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const name = body.name?.trim()
  const license = body.license?.trim()
  if (!body.id || !name || !license) {
    return NextResponse.json({ error: 'id, name and license required' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('pilots')
    .select('name, is_admin')
    .eq('id', body.id)
    .single()
  if (fetchErr || !existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Build update object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { name, license }

  // Admin toggle — cannot demote אורן וייסבלום
  if (body.isAdmin !== undefined && existing.name !== ADMIN_NAME) {
    updates.is_admin = !!body.isAdmin
  }

  // Password reset by admin
  if (body.newPassword) {
    updates.password_hash = await bcrypt.hash(body.newPassword, 12)
  }

  const { data, error } = await supabase
    .from('pilots')
    .update(updates)
    .eq('id', body.id)
    .select('id, name, license, is_admin')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing.name !== name) {
    await supabase.from('flights').update({ pilot_name: name }).eq('pilot_id', body.id)
  }
  return NextResponse.json(rowToPilot(data))
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: target, error: fetchErr } = await supabase
    .from('pilots')
    .select('name')
    .eq('id', id)
    .single()
  if (fetchErr || !target) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (target.name === ADMIN_NAME) {
    return NextResponse.json({ error: 'cannot delete admin' }, { status: 403 })
  }

  const { error } = await supabase.from('pilots').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
