import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // 1. Fetch profile with NO caching to ensure we get the fresh 'teacher' role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profileError || !profile) {
          console.error('Profile fetch error:', profileError)
          // If we can't find a profile, don't just guess 'student'
          return NextResponse.redirect(`${origin}/unauthorized?reason=no_profile`)
        }

        const role = profile.role
        console.log('User Role detected:', role) // Check your terminal for this!

        let redirectPath = '/student/dashboard'
        if (role === 'admin') redirectPath = '/admin/dashboard'
        else if (role === 'teacher') redirectPath = '/teacher/dashboard'

        return NextResponse.redirect(`${origin}${redirectPath}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}