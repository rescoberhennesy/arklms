import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function safeNext(value: string | null): string | null {
  if (!value) return null
  // Only allow relative paths within this app — block protocol/host injection
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profileError || !profile) {
          console.error('Profile fetch error:', profileError)
          return NextResponse.redirect(`${origin}/unauthorized?reason=no_profile`)
        }

        const role = profile.role
        console.log('User Role detected:', role)

        // Honor `next` if present and safe; otherwise fall back to role dashboard.
        if (next) {
          return NextResponse.redirect(`${origin}${next}`)
        }

        let redirectPath = '/student/dashboard'
        if (role === 'admin') redirectPath = '/admin/dashboard'
        else if (role === 'teacher') redirectPath = '/teacher/dashboard'
        return NextResponse.redirect(`${origin}${redirectPath}`)
      }
    }
  }
  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}