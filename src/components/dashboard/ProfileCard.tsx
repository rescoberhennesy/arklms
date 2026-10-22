'use client';

import { useEffect, useState } from 'react';
import { Mail, Copy, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getInitials } from '@/lib/utils/getInitials';

/* ---------- Avatar with initials fallback ---------- */
export function PersonAvatar({
  id,
  name,
  url,
  size,
}: {
  id: string;
  name: string;
  url: string | null | undefined;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = getInitials(name);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="block flex-shrink-0 rounded-full bg-gray-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const palette = [
    'bg-zinc-900 text-white',
    'bg-zinc-200 text-zinc-800',
    'bg-red-100 text-red-800',
    'bg-stone-200 text-stone-800',
    'bg-zinc-700 text-white',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;

  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold',
        palette[Math.abs(h) % palette.length],
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      title={name}
    >
      {initials}
    </span>
  );
}

/* ---------- Profile popup ---------- */
export function ProfileCard({
  id,
  name,
  email,
  avatarUrl,
  roleLabel,
  highlightRole = false,
  details = [],
  onClose,
}: {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  roleLabel: string;
  /** red badge (e.g. for Teacher) instead of grey */
  highlightRole?: boolean;
  /** extra rows, e.g. [{ label: 'Joined', value: 'Oct 20, 2026' }] */
  details?: { label: string; value: string }[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-card-name"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-t-3xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:rounded-3xl"
      >
        <div className="relative h-24 bg-zinc-900">
          <svg aria-hidden="true" className="absolute -right-10 -top-16 h-44 w-44" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeOpacity="0.08" />
          </svg>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-10 -mt-12 flex flex-col items-center px-6 pb-6 text-center">
          <div className="rounded-full ring-4 ring-white">
            <PersonAvatar id={id} name={name} url={avatarUrl} size={96} />
          </div>

          <h2 id="profile-card-name" className="mt-3 text-lg font-extrabold text-zinc-900">
            {name}
          </h2>
          <span
            className={cn(
              'mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
              highlightRole ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-700',
            )}
          >
            {roleLabel}
          </span>

          {details.length > 0 && (
            <dl className="mt-4 grid w-full grid-cols-2 gap-2 text-left">
              {details.map((d) => (
                <div key={d.label} className="rounded-xl bg-zinc-50 px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{d.label}</dt>
                  <dd className="truncate text-sm font-semibold text-zinc-900">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {email && (
            <>
              <p className="mt-3 w-full truncate rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">{email}</p>
              <div className="mt-3 grid w-full grid-cols-2 gap-2">
                <a
                  href={`mailto:${email}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-bold text-white transition hover:bg-zinc-800"
                >
                  <Mail className="h-4 w-4" />
                  Send email
                </a>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy email'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}