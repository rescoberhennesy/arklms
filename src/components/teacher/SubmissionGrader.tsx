'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Send,
  Trash2,
  Paperclip,
  Download,
  Loader2,
  Award,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import MarkdownEditor from '@/components/dashboard/MarkdownEditor';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import {
  AISuggestFeedbackProvider,
  AISuggestFeedbackButton,
  AISuggestFeedbackCard,
} from '@/components/teacher/ai/AISuggestFeedback';
import { markAiGenerationPublished } from '@/lib/actions/aiGenerations';
import {
  gradeSubmission,
  returnGrade,
  ungradeSubmission,
  getSignedSubmissionAttachmentUrl,
} from '@/lib/actions/activities';
import type {
  SubmissionWithGrade,
  ActivityWithAllSubmissions,
} from '@/lib/types/activities';

interface SubmissionGraderProps {
  submission: SubmissionWithGrade;
  activity: ActivityWithAllSubmissions;
  classId: string;
}

// Signature used to detect when the server-fetched submission/grade actually
// changed (e.g. after revalidation) so we can resync local state without
// clobbering unsaved teacher edits.
function gradeSignature(s: SubmissionWithGrade): string {
  const g = s.grade;
  return [
    s.id,
    g?.id ?? 'no-grade',
    g ? String(g.score) : '-',
    g?.feedback ?? '',
    g?.returnedAt ?? '',
  ].join('|');
}

export default function SubmissionGrader({
  submission,
  activity,
  classId,
}: SubmissionGraderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Local editable grade state, seeded from the server-fetched grade.
  const [scoreInput, setScoreInput] = useState<string>(
    submission.grade ? String(submission.grade.score) : '',
  );
  const [feedback, setFeedback] = useState<string>(
    submission.grade?.feedback ?? '',
  );
  const [pendingGenerationId, setPendingGenerationId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showUngradeConfirm, setShowUngradeConfirm] = useState(false);

  // Prop-sync: if the server-side submission/grade signature changes (e.g.
  // after revalidation), and the teacher hasn't started editing, resync
  // local state. Editing-state ref prevents clobbering unsaved input.
  const editingRef = useRef(false);
  const lastSigRef = useRef(gradeSignature(submission));

  useEffect(() => {
    const newSig = gradeSignature(submission);
    if (newSig !== lastSigRef.current) {
      lastSigRef.current = newSig;
      if (!editingRef.current) {
        setScoreInput(submission.grade ? String(submission.grade.score) : '');
        setFeedback(submission.grade?.feedback ?? '');
      }
    }
  }, [submission]);

  const grade = submission.grade;
  const isReleased = !!grade?.returnedAt;
  const attachments = submission.attachments;

  // ---- Validation -------------------------------------------------------

  function parseScore(): number | null {
    const trimmed = scoreInput.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > activity.maxPoints) return null;
    return n;
  }

  // ---- Handlers ---------------------------------------------------------

  function handleScoreChange(v: string) {
    editingRef.current = true;
    setScoreInput(v);
    setError(null);
  }

  function handleFeedbackChange(v: string) {
    editingRef.current = true;
    setFeedback(v);
    setError(null);
  }

  function handleAiAccept(suggestedFeedback: string, generationId: string | null) {
    editingRef.current = true;
    setFeedback(suggestedFeedback);
    setPendingGenerationId(generationId);
    setError(null);
  }

  function handleSaveDraft() {
    const score = parseScore();
    if (score === null) {
      setError(
        `Score must be a number between 0 and ${activity.maxPoints}.`,
      );
      return;
    }
    setError(null);
    const generationId = pendingGenerationId;
    startTransition(async () => {
      try {
        await gradeSubmission(submission.id, score, feedback);
        if (generationId) {
          await markAiGenerationPublished(generationId, { feedback });
        }
        editingRef.current = false;
        setPendingGenerationId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save grade');
      }
    });
  }

  function handleSaveAndRelease() {
    const score = parseScore();
    if (score === null) {
      setError(
        `Score must be a number between 0 and ${activity.maxPoints}.`,
      );
      return;
    }
    setError(null);
    const generationId = pendingGenerationId;
    startTransition(async () => {
      try {
        await gradeSubmission(submission.id, score, feedback);
        await returnGrade(submission.id);
        if (generationId) {
          await markAiGenerationPublished(generationId, { feedback });
        }
        editingRef.current = false;
        setPendingGenerationId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to release grade');
      }
    });
  }

  function handleUngrade() {
    setShowUngradeConfirm(false);
    startTransition(async () => {
      try {
        await ungradeSubmission(submission.id);
        editingRef.current = false;
        setScoreInput('');
        setFeedback('');
        setPendingGenerationId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to ungrade');
      }
    });
  }

  async function handleDownloadAttachment(attachmentId: string) {
    try {
      const url = await getSignedSubmissionAttachmentUrl(attachmentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch attachment',
      );
    }
  }

  // ---- Status pill ------------------------------------------------------

  let statusPill: { className: string; label: string };
  if (!grade) {
    statusPill = submission.isLate
      ? {
          className: 'bg-amber-100 text-amber-800',
          label: 'Submitted (late)',
        }
      : { className: 'bg-blue-100 text-blue-800', label: 'Submitted' };
  } else if (!isReleased) {
    statusPill = {
      className: 'bg-purple-100 text-purple-800',
      label: 'Graded (not released)',
    };
  } else {
    statusPill = {
      className: 'bg-green-100 text-green-800',
      label: 'Graded & released',
    };
  }

  const currentScore = parseScore();

  // ---- Render -----------------------------------------------------------

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      {/* ---- Left column: submission viewer ----------------------------- */}
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-gray-900">
                {submission.studentName || 'Unknown student'}
              </h1>
              <div className="mt-0.5 truncate text-sm text-gray-500">
                {submission.studentEmail}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Submitted{' '}
                  {new Date(submission.submittedAt).toLocaleString()}
                </span>
                {submission.isLate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                    <AlertCircle className="h-3 w-3" />
                    Late
                  </span>
                )}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusPill.className}`}
            >
              {statusPill.label}
            </span>
          </div>
        </div>

        {/* Text body */}
        {submission.textBody && submission.textBody.trim() !== '' && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
              Text response
            </h2>
            <MarkdownContent body={submission.textBody} />
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Paperclip className="h-4 w-4" />
              Attachments ({attachments.length})
            </h2>
            <ul className="divide-y divide-gray-100">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-900">
                      {a.fileName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(a.fileSize / 1024).toFixed(1)} KB · {a.mimeType}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(a.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty submission body fallback */}
        {(!submission.textBody || submission.textBody.trim() === '') &&
          attachments.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
              This submission has no text or attachments.
            </div>
          )}
      </div>

      {/* ---- Right column: grading panel -------------------------------- */}
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Award className="h-4 w-4" />
            Grading
          </h2>

          {/* Existing grade indicator */}
          {grade && (
            <div
              className={`mb-3 rounded-md px-3 py-2 text-xs ${
                isReleased
                  ? 'bg-green-50 text-green-800'
                  : 'bg-purple-50 text-purple-800'
              }`}
            >
              {isReleased ? (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Released to student on{' '}
                  {new Date(grade.returnedAt!).toLocaleString()}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Saved as draft, not yet released
                </span>
              )}
            </div>
          )}

          {/* Score input */}
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Score
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={activity.maxPoints}
                step="any"
                value={scoreInput}
                onChange={(e) => handleScoreChange(e.target.value)}
                disabled={pending}
                className="w-24 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-50"
                placeholder="0"
              />
              <span className="text-sm text-gray-500">
                / {activity.maxPoints}
              </span>
            </div>
          </label>

          {/* Feedback — Provider wraps label+button (compact row) AND the
              full-width card+editor, so all three pieces share state. */}
          <AISuggestFeedbackProvider
            endpoint="/api/ai/feedback/submission"
            body={{
              submissionId: submission.id,
              score: currentScore ?? 0,
            }}
            disabled={currentScore === null || pending}
            disabledReason="Enter a valid score first"
            onAccept={handleAiAccept}
          >
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="block text-xs font-medium text-gray-700">
                  Feedback (optional, markdown)
                </span>
                <AISuggestFeedbackButton />
              </div>
              <AISuggestFeedbackCard />
              <div className="mt-2">
                <MarkdownEditor
                  value={feedback}
                  onChange={handleFeedbackChange}
                  placeholder="Leave feedback for the student..."
                  rows={6}
                  disabled={pending}
                />
              </div>
            </div>
          </AISuggestFeedbackProvider>

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSaveAndRelease}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isReleased ? 'Save & re-release' : 'Save & release'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save draft
            </button>
            {grade && (
              <button
                type="button"
                onClick={() => setShowUngradeConfirm(true)}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Ungrade
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showUngradeConfirm}
        title="Remove this grade?"
        message={
          isReleased
            ? 'This will remove the grade and revoke it from the student. They will see the submission as ungraded again.'
            : 'This will discard the draft grade and feedback.'
        }
        confirmLabel="Remove grade"
        destructive
        onConfirm={handleUngrade}
        onClose={() => setShowUngradeConfirm(false)}
      />
    </div>
  );
}
