'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { AdminStudentRow } from '@/lib/actions/admin';
import { getInitials } from '@/lib/utils/getInitials';

function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminStudentsView({
  students,
}: {
  students: AdminStudentRow[];
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.fullName ?? '').toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.username ?? '').toLowerCase().includes(q),
    );
  }, [students, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-600">
            All registered student accounts.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {filtered.length} of {students.length}
        </span>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or username…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm italic text-gray-500">
          {students.length === 0
            ? 'No student accounts registered yet.'
            : 'No students match your search.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5 text-right">Enrollments</th>
                  <th className="px-4 py-2.5">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <AvatarChip
                          url={s.avatarUrl}
                          name={s.fullName ?? s.email}
                        />
                        <span className="font-medium text-gray-900">
                          {s.fullName ?? (
                            <span className="italic text-gray-400">
                              No name
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{s.email}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {s.username ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {s.enrollmentCount}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {formatJoinDate(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarChip({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-[11px] font-semibold text-red-700">
      {getInitials(name)}
    </span>
  );
}