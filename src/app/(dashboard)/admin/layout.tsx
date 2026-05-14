
// src/app/(dashboard)/admin/layout.tsx
//
// Shared route guard for every page under /admin/*. The parent
// (dashboard) layout only AUTHENTICATES (confirms a user + profile
// exist) — it does NOT authorize by role. Without this file, any
// authenticated teacher or student could load /admin/* by typing the
// URL directly; the sidebar hiding the link is not real protection.
//
// Behavior:
//   - Admin  -> renders children normally.
//   - Non-admin (teacher/student) -> redirect('/unauthorized').
//   - Fetch error / missing profile -> fail CLOSED, redirect too.
//
// This is a navigation only. It does not sign anyone out and does not
// touch any non-/admin route. The session is untouched either way.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/user';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The parent (dashboard) layout already redirects unauthenticated
  // users, but we re-check defensively — layouts can render in any
  // order and we never want /admin/* to render without a confirmed
  // admin behind it.
  if (!user) redirect('/');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>();

  // Fail closed: any error, missing profile, or non-admin role bounces
  // to /unauthorized. The only way past this point is a confirmed
  // role === 'admin'.
  if (error || !profile || profile.role !== 'admin') {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
