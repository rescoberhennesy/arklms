'use client';

import { Loader2, Play, Calendar, Award, Timer, AlertCircle } from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import type { ActivityWithStudentState } from '@/lib/types/activities';

interface QuizLandingProps {
  activity: ActivityWithStudentState;
  onStart: () => void;
  starting: boolean;
}

export default function QuizLanding({
  activity,
  onStart,
  starting,
}: QuizLandingProps) {
  const dueAtMs = new Date(activity.dueAt).getTime();
  const isPastDue = Date.now() > dueAtMs;
  const canStart = !isPastDue || activity.allowLate;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            Quiz
          </span>
          {isPastDue && !activity.allowLate && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              Past due
            </span>
          )}
          {isPastDue && activity.allowLate && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Late submission
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{activity.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Due {new Date(activity.dueAt).toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <Award className="h-4 w-4" />
            {activity.maxPoints} pt{activity.maxPoints === 1 ? '' : 's'}
          </span>
        </div>

        {activity.description.trim() && (
          <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 p-3">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Instructions
            </h2>
            <MarkdownContent body={activity.description} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm text-amber-900">
            <p className="font-semibold">Before you begin</p>
            <ul className="ml-4 list-disc space-y-1 text-amber-900">
              <li>You can only attempt this quiz <strong>once</strong>.</li>
              <li>Your answers save automatically as you go.</li>
              <li>
                Submission is final — once you submit, you can&apos;t change
                answers.
              </li>
              <li>
                If a time limit applies, the timer starts when you click
                &ldquo;Start quiz&rdquo;.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {!canStart && (
          <span className="text-sm text-red-700">
            This quiz is past due and late submissions are not allowed.
          </span>
        )}
        <button
          type="button"
          onClick={onStart}
          disabled={starting || !canStart}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Start quiz
        </button>
      </div>
    </div>
  );
}