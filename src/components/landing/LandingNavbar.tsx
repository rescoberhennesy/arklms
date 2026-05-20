'use client'

import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LandingNavbar() {
  const searchParams = useSearchParams()

  const handleLogin = async () => {
    const supabase = createClient()
    // Clear any stale session before starting fresh OAuth
    await supabase.auth.signOut()

    // Carry ?next=... through OAuth so /auth/callback can redirect back
    const rawNext = searchParams.get('next')
    const safeNext =
      rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
        ? rawNext
        : null

    const callbackUrl = safeNext
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
      : `${window.location.origin}/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email openid profile User.Read',
        redirectTo: callbackUrl,
        queryParams: {
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      console.error('Microsoft login error:', error.message)
      alert('Login failed. Please try again.')
    }
  }

  return (
    <header className="nav-wrap">
      <div className="nav-inner">
        <div className="nav-left">
          <a href="/" aria-label="Go to home">
            <img
              src="/arklogo-removebg-preview.png"
              alt="ARK Logo"
              className="nav-logo"
            />
          </a>
          <a href="/" className="nav-title-link">
            <div className="nav-title">
              ARK Technological Institute Education System Inc.
            </div>
          </a>
        </div>
        <div className="nav-right">
          <a href="/" className="nav-link">
            <strong> Home </strong>
          </a>
          <a href="/about" className="nav-link">
            <strong> About </strong>
          </a>
          <a href="/contact" className="nav-link">
            <strong> Contact </strong>
          </a>
          <button className="nav-login-btn" onClick={handleLogin}>
            Log in
          </button>
        </div>
      </div>
    </header>
  )
}