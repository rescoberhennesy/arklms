'use client';

import { ExternalLink, ShieldCheck } from 'lucide-react';

/**
 * Read-only security info. Auth is delegated to Microsoft Entra ID, so
 * there's no in-app password reset — this panel explains that and links
 * to the Microsoft self-service password reset portal.
 */
export default function SecurityPanel() {
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Password &amp; Security
        </h2>
      </div>
      <p className="text-sm text-gray-700">
        Your sign-in and password are managed by your organization through
        Microsoft. This app never stores or handles your password directly.
      </p>
      <p className="text-sm text-gray-700">
        To change or reset a forgotten password, use Microsoft&apos;s secure
        password portal. If self-service reset isn&apos;t available for your
        account, contact your institution&apos;s administrator.
      </p>
      <a
        href="https://aka.ms/sspr"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Reset password with Microsoft
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </section>
  );
}