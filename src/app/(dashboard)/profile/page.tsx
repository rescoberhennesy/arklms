import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy route. Profile editing now lives at /settings under the Profile
 * tab. We redirect rather than 404 so any external bookmarks or in-app
 * links to /profile still land correctly.
 */
export default function ProfileRedirect() {
  redirect('/settings?tab=profile');
}