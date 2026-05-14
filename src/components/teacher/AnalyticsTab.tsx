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
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
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

      {sub === 'students' && (
        <StudentWatchPanel classId={classId} initialData={studentStats} />
      )}
      {sub === 'activities' && (
        <ActivityDiagnosticsPanel classId={classId} activities={activities} />
      )}
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
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-red-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}