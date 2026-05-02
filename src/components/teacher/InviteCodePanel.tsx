'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, Lock, Unlock, AlertTriangle } from 'lucide-react';
import {
  regenerateInviteCode,
  setInviteCodeDisabled,
} from '@/lib/actions/classes';
import {
  INVITE_EXPIRATION_PRESETS,
  type InviteExpirationHours,
} from '@/types/class';
import { CopyButton } from './CopyButton';

interface InviteCodePanelProps {
  classId: string;
  initialCode: string;
  initialExpiresAt: string | null;
  initialDisabled: boolean;
}

function formatExpiry(iso: string | null): { label: string; expired: boolean } {
  if (!iso) return { label: 'Never expires', expired: false };
  const date = new Date(iso);
  const expired = date.getTime() < Date.now();
  return {
    label: expired
      ? `Expired ${date.toLocaleDateString()}`
      : `Expires ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    expired,
  };
}

export function InviteCodePanel({
  classId,
  initialCode,
  initialExpiresAt,
  initialDisabled,
}: InviteCodePanelProps) {
  const [code, setCode] = useState(initialCode);
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [disabled, setDisabled] = useState(initialDisabled);
  const [presetHours, setPresetHours] = useState<InviteExpirationHours>(24 * 7);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const res = await regenerateInviteCode(classId, presetHours);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCode(res.data.invite_code);
      setExpiresAt(res.data.invite_code_expires_at);
      setDisabled(false);
    });
  }

  function handleToggleDisabled() {
    setError(null);
    startTransition(async () => {
      const res = await setInviteCodeDisabled(classId, !disabled);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDisabled(!disabled);
    });
  }

  const expiry = formatExpiry(expiresAt);
  const inactive = disabled || expiry.expired;
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Invite code</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Share this code or link with students so they can request to join.
          </p>
        </div>
        {inactive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            {disabled ? 'Disabled' : 'Expired'}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
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

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={joinUrl}
            className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          />
          <CopyButton
            text={joinUrl}
            label="Copy link"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          />
        </div>

        <p className="text-xs text-gray-500">{expiry.label}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <label className="text-xs font-medium text-gray-700">
          New code expires in:
          <select
            value={presetHours === null ? 'never' : String(presetHours)}
            onChange={(e) => {
              const v = e.target.value;
              setPresetHours(v === 'never' ? null : Number(v));
            }}
            className="ml-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
          >
            {INVITE_EXPIRATION_PRESETS.map((p) => (
              <option key={p.label} value={p.hours === null ? 'never' : String(p.hours)}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reset code
        </button>

        <button
          type="button"
          onClick={handleToggleDisabled}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {disabled ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {disabled ? 'Enable code' : 'Disable code'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
