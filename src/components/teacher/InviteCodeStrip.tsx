'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Settings } from 'lucide-react';
import { CopyButton } from './CopyButton';

interface InviteCodeStripProps {
  classId: string;
  code: string;
  expiresAt: string | null;
  disabled: boolean;
}

function formatExpiry(iso: string | null): { label: string; expired: boolean } {
  if (!iso) return { label: 'Never expires', expired: false };
  const date = new Date(iso);
  const expired = date.getTime() < Date.now();
  return {
    label: expired
      ? `Expired ${date.toLocaleDateString()}`
      : `Expires ${date.toLocaleDateString()}`,
    expired,
  };
}

/**
 * Compact, read-only invite code widget for the Stream tab.
 *
 * Shows the code, expiration text, and copy buttons (code + link). For
 * management actions (reset, disable) the user clicks "Manage" to navigate
 * to the class settings page where the full InviteCodePanel lives.
 */
export default function InviteCodeStrip({
  classId,
  code,
  expiresAt,
  disabled,
}: InviteCodeStripProps) {
  // Compute join URL on the client only -- avoids SSR/hydration mismatch
  // since window.location is unavailable on the server.
  const [joinUrl, setJoinUrl] = useState<string>('');
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${code}`);
  }, [code]);

  const expiry = formatExpiry(expiresAt);
  const inactive = disabled || expiry.expired;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Invite code</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Share this with students.
          </p>
        </div>
        {inactive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            {disabled ? 'Disabled' : 'Expired'}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-base tracking-wider text-gray-800">
            {code}
          </code>
          <CopyButton
            text={code}
            label="Copy code"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          />
        </div>

        <CopyButton
          text={joinUrl}
          label="Copy join link"
          disabled={!joinUrl}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        />

        <p className="text-xs text-gray-500">{expiry.label}</p>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <Link
          href={`/teacher/classes/${classId}/settings`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <Settings className="h-3.5 w-3.5" />
          Manage code & settings
        </Link>
      </div>
    </div>
  );
}
