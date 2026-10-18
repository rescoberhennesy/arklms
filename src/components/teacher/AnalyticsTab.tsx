// src/components/teacher/AnalyticsTab.tsx
'use client';

import { useState } from 'react';
import { Users, Target } from 'lucide-react';
import type {
  ClassStudentStatsResult,
  AnalyticsActivityOption,
} from '@/lib/actions/analytics';
import StudentWatchPanel from './StudentWatchPanel';
import ActivityDiagnosticsPanel from './ActivityDiagnosticsPanel';

type SubTab = 'students' | 'activities';

interface Props {
  classId: string;
  studentStats: ClassStudentStatsResult;
  activities: AnalyticsActivityOption[];
}

export default function AnalyticsTab({ classId, studentStats, activities }: Props) {
  const [sub, setSub] = useState<SubTab>('students');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Analytics view"
        className="inline-flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <SubTabButton
          active={sub === 'students'}
          onClick={() => setSub('students')}
          icon={<Users className="h-4 w-4" />}
          label="Student watch"
        />
        <SubTabButton
          active={sub === 'activities'}
          onClick={() => setSub('activities')}
          icon={<Target className="h-4 w-4" />}
          label="Activity diagnostics"
        />
      </div>

      {sub === 'students' && <StudentWatchPanel classId={classId} initialData={studentStats} />}
      {sub === 'activities' && <ActivityDiagnosticsPanel classId={classId} activities={activities} />}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition ${
        active
          ? 'bg-red-600 font-semibold text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
          : 'font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}