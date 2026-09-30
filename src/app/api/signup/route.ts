import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email, password, companyName } = await req.json()

    if (!email || !password || !companyName) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Check if email already exists
    const { data: existingAuth } = await supabaseAdmin.auth.admin.listUsers()
    const emailExists = existingAuth?.users?.some(u => u.email?.toLowerCase() === normalizedEmail)
    if (emailExists) {
      return NextResponse.json({ error: 'This email is already registered' }, { status: 409 })
    }

    // 2. Create company FIRST
    const { data: company, error: compError } = await supabaseAdmin
      .from('companies')
      .insert({ name: companyName.trim() })
      .select('id, name')
      .single()

    if (compError || !company) {
      return NextResponse.json({ error: 'Company creation failed: ' + (compError?.message || 'unknown') }, { status: 500 })
    }

    // 3. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    })

    if (authError || !authData?.user) {
      await supabaseAdmin.from('companies').delete().eq('id', company.id)
      return NextResponse.json({ error: 'Auth creation failed: ' + (authError?.message || 'unknown') }, { status: 500 })
    }

    // 4. Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        auth_user_id: authData.user.id,
        company_id: company.id,
        full_name: companyName.trim() + ' Admin',
        role: 'Admin',
        is_active: true,
        is_deleted: false,
      })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      await supabaseAdmin.from('companies').delete().eq('id', company.id)
      return NextResponse.json({ error: 'Profile creation failed: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      company_id: company.id,
      user_id: authData.user.id
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 })
  }
}
