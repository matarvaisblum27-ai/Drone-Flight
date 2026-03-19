import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Pilot } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ADMIN_NAME = 'אורן וייסבלום'

export async function GET() {
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as Pilot[])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = body.name?.trim()
  const license = body.license?.trim()
  if (!name || !license) {
    return NextResponse.json({ error: 'name and license required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pilots')
    .insert({ id: `p${Date.now()}`, name, license })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'pilot with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data as Pilot, { status: 201 })
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
    .select('name')
    .eq('id', body.id)
    .single()
  if (fetchErr || !existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('pilots')
    .update({ name, license })
    .eq('id', body.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing.name !== name) {
    await supabase.from('flights').update({ pilot_name: name }).eq('pilot_id', body.id)
  }
  return NextResponse.json(data as Pilot)
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
