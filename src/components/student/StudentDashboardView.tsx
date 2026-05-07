'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import type { StudentClassListItem } from '@/types/class';
import ClassCover from '@/components/dashboard/ClassCover';
import JoinClassModal from './JoinClassModal';

type Props = {
  activeCount: number;
  pendingCount: number;
  recentClasses: StudentClassListItem[];
};

export default function StudentDashboardView({
  activeCount,
  pendingCount,
  recentClasses,
}: Props) {
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
          <p className="mt-1 text-sm text-gray-600">
            Here&apos;s a quick overview of your classes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setJoinOpen(true)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          + Join class
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Active classes" value={activeCount} />
        <StatCard label="Pending requests" value={pendingCount} />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent classes</h2>
          <Link
            href="/student/classes"
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            View all →
          </Link>
        </div>
        {recentClasses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-600">
              You haven&apos;t joined any classes yet.
            </p>
            <button
              type="button"
              onClick={() => setJoinOpen(true)}
              className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
            >
              Join your first class →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentClasses.map((c) => (
              <RecentClassCard key={c.id} cls={c} />
            ))}
          </div>
        )}
      </section>

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function RecentClassCard({ cls }: { cls: StudentClassListItem }) {
  return (
    <Link
      href={`/student/classes/${cls.id}`}
      className="block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <ClassCover
        url={cls.cover_photo_url}
        color={cls.color}
        className="h-24 w-full"
      >
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="truncate text-base font-semibold text-white drop-shadow-sm">
            {cls.name}
          </h3>
          {cls.section && (
            <p className="truncate text-xs text-white/90 drop-shadow-sm">
              {cls.section}
            </p>
          )}
        </div>
      </ClassCover>
      <div className="flex items-center justify-between p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {cls.semester}
        </p>
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <Users className="h-3.5 w-3.5" />
          <span className="truncate">{cls.teacher_name ?? 'Teacher'}</span>
        </div>
      </div>
    </Link>
  );
}
