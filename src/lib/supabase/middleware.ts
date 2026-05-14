
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // /join/<code> needs special handling: signed-out users should bounce to
  // landing with a `next` param so they return here after auth.
  // We do this in middleware (rather than in the page itself) because
  // Next.js 16 redirect() drops query strings.
  if (pathname.startsWith('/join/') && !user) {
    const target = new URL('/', request.url)
    target.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(target)
  }

  // Protected routes - require authentication
  const protectedPaths = ['/admin', '/teacher', '/student']
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Role-based protection
  if (user && isProtected) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile) {
      const userRole = profile.role
      if (pathname.startsWith('/admin') && userRole !== 'admin') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      if (pathname.startsWith('/teacher') && userRole !== 'teacher') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      if (pathname.startsWith('/student') && userRole !== 'student') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    }

    // "Last seen" tracking (Session 14).
    //
    // The user is authenticated and on a protected route — touch their
    // last_active_at via the touch_last_active() RPC.
    //
    // WHY AN RPC: profiles has no self-service FOR UPDATE RLS policy, so a
    // direct `.update()` from this (anon-key + user-cookie) client matches
    // zero rows and silently no-ops. The SECURITY DEFINER RPC
    // (migration 20260514010000) bypasses RLS but can only ever set
    // last_active_at for auth.uid() — no privilege-escalation surface.
    //
    // Fire-and-forget: deliberately NOT awaited. A slow or failed RPC must
    // never delay or break a page load. The `.then()` error sink keeps an
    // unhandled rejection from surfacing; there is no success path to
    // handle. No throttle — at ALMS scale a few RPC calls per minute is
    // negligible, and an unconditional call avoids fragile filter logic.
    void supabase.rpc('touch_last_active').then(
      () => {},
      (err: unknown) => {
        console.error('[middleware] touch_last_active error:', err)
      }
    )
  }

  return supabaseResponse
}
