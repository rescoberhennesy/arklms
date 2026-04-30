'use client'

import { createClient } from '@/lib/supabase/client'

export default function LandingNavbar() {
  const handleLogin = async () => {
  const supabase = createClient()

  // Clear any stale session before starting fresh OAuth
  await supabase.auth.signOut()

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email openid profile User.Read',
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        prompt: 'select_account', // Forces Microsoft to show sign-in page every time
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
          <img
            src="/arklogo-removebg-preview.png"
            alt="ARK Logo"
            className="nav-logo"
          />
          <div className="nav-title">
            ARK Technological Institute Education System Inc.
          </div>
        </div>

        <div className="nav-right">
          <a href="#" className="nav-link">
            <strong> Helpdesk </strong>
          </a>
          <a href="#" className="nav-link">
            <strong> FAQ </strong>
          </a>
          <button className="nav-login-btn" onClick={handleLogin}>
            Log in
          </button>
        </div>
      </div>
    </header>
  )
}