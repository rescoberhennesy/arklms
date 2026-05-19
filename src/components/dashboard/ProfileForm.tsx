// src/components/dashboard/ProfileForm.tsx
'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check } from 'lucide-react';
import type { Profile } from '@/types/user';
import { updateMyProfile, uploadMyAvatar } from '@/lib/actions/profile';
import { getInitials } from '@/lib/utils/getInitials';
import { cn } from '@/lib/utils/cn';

interface Props {
  profile: Profile;
}

export default function ProfileForm({ profile }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saving, startSaving] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // When an avatar upload succeeds we set this. The <img> onLoad handler
  // then fires router.refresh() — AFTER the new image is in the browser
  // cache — so the layout's server re-render swaps in an <img> that loads
  // instantly from cache instead of aborting an in-flight request.
  const pendingRefresh = useRef(false);

  // Compare against the *last saved* values, not the original prop, so the
  // Save button correctly disables again after a successful save.
  const [savedName, setSavedName] = useState(profile.full_name ?? '');
  const [savedUsername, setSavedUsername] = useState(profile.username ?? '');

  const dirty =
    fullName.trim() !== savedName ||
    (username.trim() || '') !== (savedUsername || '');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateMyProfile({
        full_name: fullName,
        username: username.trim() || null,
      });
      if (res.ok) {
        setSavedName(res.data.full_name ?? '');
        setSavedUsername(res.data.username ?? '');
        showToast('Profile updated');
        // Text-only update: no image to race, safe to refresh immediately.
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadMyAvatar(fd);
      console.log('avatar upload result:', JSON.stringify(res));
      if (res.ok) {
        // Mark that a refresh is owed. We do NOT call router.refresh() here
        // — doing so would unmount the <img> mid-download and the browser
        // would abort the request (NS_BINDING_ABORTED, blank avatar).
        pendingRefresh.current = true;
        setAvatarUrl(res.data.avatar_url);
        showToast('Photo updated');
      } else {
        setError(res.error);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Fires once the new avatar image has finished downloading into the
  // browser cache. Only then is it safe to refresh server components:
  // the re-rendered <img> will hit cache instantly, no aborted request.
  function handleAvatarLoaded() {
    if (pendingRefresh.current) {
      pendingRefresh.current = false;
      router.refresh();
    }
  }

  const displayName = fullName || profile.email;
  const initials = getInitials(displayName || 'User');

  return (
    <div className="space-y-6">

      {/* Avatar */}
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="relative">

{avatarUrl ? (
  <span className="relative block h-20 w-20 overflow-hidden rounded-full bg-gray-200">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      key={avatarUrl}
      src={avatarUrl}
      alt={displayName ?? 'Avatar'}
      crossOrigin="anonymous"
      className="h-full w-full object-cover"
      onLoad={handleAvatarLoaded}
    />
  </span>
) : (
  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-xl font-semibold text-red-700">
    {initials}
  </span>
)}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-red-600 p-1.5 text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            aria-label="Change photo"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">Profile photo</p>
          <p className="text-xs text-gray-500">
            {uploading ? 'Uploading…' : 'JPEG, PNG, or WebP. Max 2 MB.'}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </div>

      {/* Editable fields */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <Field label="Full name">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            maxLength={120}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </Field>

        <Field label="Username" hint="Optional. Shown in some places instead of your full name.">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Optional"
            maxLength={40}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </Field>
      </div>

      {/* Read-only account info */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Account
        </h2>
        <ReadOnlyRow label="Email" value={profile.email} />
        <ReadOnlyRow
          label="Role"
          value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
        />
        {profile.institution && (
          <ReadOnlyRow label="Institution" value={profile.institution} />
        )}
        <ReadOnlyRow
          label="Member since"
          value={new Date(profile.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        />
        <p className="pt-1 text-xs text-gray-400">
          Email and role are managed by your institution and can&apos;t be changed here.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
            dirty && !saving
              ? 'bg-red-600 hover:bg-red-700'
              : 'cursor-not-allowed bg-gray-300',
          )}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <Check className="h-4 w-4 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="truncate text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}