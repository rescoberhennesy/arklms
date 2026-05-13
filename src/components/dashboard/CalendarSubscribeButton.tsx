'use client';

import { useState, useTransition } from 'react';
import {
  CalendarPlus,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  getOrCreateCalendarToken,
  regenerateCalendarToken,
} from '@/lib/actions/calendarToken';

export default function CalendarSubscribeButton() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [regenerating, startRegenerating] = useTransition();

  function handleOpen() {
    setError(null);
    setOpen(true);
    if (token) return;
    startLoading(async () => {
      try {
        const t = await getOrCreateCalendarToken();
        setToken(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to get token.');
      }
    });
  }

  function handleRegenerate() {
    setError(null);
    setConfirmRegenerate(false);
    startRegenerating(async () => {
      try {
        const t = await regenerateCalendarToken();
        setToken(t);
        setCopied(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to regenerate.');
      }
    });
  }

  const url =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/calendar/${token}`
      : '';

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById(
        'calendar-subscribe-url',
      ) as HTMLInputElement | null;
      if (input) {
        input.select();
        input.setSelectionRange(0, 99999);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <CalendarPlus className="h-4 w-4" />
        Subscribe to calendar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Subscribe to your calendar
                </h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  Get your activity deadlines and tasks in Google Calendar,
                  Apple Calendar, or any other calendar app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {loading || !token ? (
              <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading subscription URL…
              </div>
            ) : (
              <>
                <label
                  htmlFor="calendar-subscribe-url"
                  className="mb-1 block text-xs font-medium text-gray-700"
                >
                  Subscription URL
                </label>
                <div className="flex gap-2">
                  <input
                    id="calendar-subscribe-url"
                    type="text"
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs text-gray-700">
                  <details className="rounded-md border border-gray-200 p-3">
                    <summary className="cursor-pointer font-medium text-gray-900">
                      How to add this to Google Calendar
                    </summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Open Google Calendar in a browser.</li>
                      <li>
                        On the left, next to &quot;Other calendars,&quot;
                        click the &quot;+&quot; → &quot;From URL.&quot;
                      </li>
                      <li>Paste the URL above and click &quot;Add calendar.&quot;</li>
                      <li>
                        Google syncs subscribed calendars every few hours.
                        Changes here may take a while to appear.
                      </li>
                    </ol>
                  </details>

                  <details className="rounded-md border border-gray-200 p-3">
                    <summary className="cursor-pointer font-medium text-gray-900">
                      How to add this to Apple Calendar
                    </summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Open Calendar on Mac.</li>
                      <li>
                        File → New Calendar Subscription. Paste the URL and
                        click Subscribe.
                      </li>
                      <li>
                        On iPhone/iPad: Settings → Calendar → Accounts →
                        Add Account → Other → Add Subscribed Calendar.
                      </li>
                    </ol>
                  </details>
                </div>

                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-medium">Keep this URL private.</p>
                      <p className="mt-0.5">
                        Anyone with this URL can read your activity
                        deadlines and personal tasks. If you share it by
                        accident, click &quot;Regenerate&quot; to invalidate
                        the old URL.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  {confirmRegenerate ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-700">
                        This will break your existing subscription. Sure?
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmRegenerate(false)}
                        disabled={regenerating}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        disabled={regenerating}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {regenerating && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        Regenerate
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRegenerate(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:underline"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate URL
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
