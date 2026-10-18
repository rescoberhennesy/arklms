'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Hourglass,
  Paperclip,
  Upload,
  X,
  Loader2,
  Send,
  Download,
  AlertCircle,
  CheckCircle2,
  Save,
  Trash2,
  RefreshCw,
  FileEdit,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import {
  submitActivity,
  discardDraft,
  getSignedSubmissionAttachmentUrl,
} from '@/lib/actions/activities';
import {
  type ActivityWithStudentState,
  type ActivityAttachment,
  type ActivitySubmission,
  type SubmissionAttachmentInput,
  SUBMISSION_TYPE_LABELS,
} from '@/lib/types/activities';
import StudentActivityAttachmentsList from '@/components/student/StudentActivityAttachmentsList';
import { MODULE_TERM_LABELS } from '@/lib/types/modules';

interface StudentActivityViewProps {
  classId: string;
  activity: ActivityWithStudentState;
  currentUserId: string;
  attachments: ActivityAttachment[];
}

// Sanitize filename for storage path: keep alnum, dot, dash, underscore.
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Build storage path matching Migration 2 layout:
// <class_id>/<activity_id>/<student_id>/<timestamp>-<filename>
function buildStoragePath(
  classId: string,
  activityId: string,
  studentId: string,
  filename: string,
): string {
  const ts = Date.now();
  return `${classId}/${activityId}/${studentId}/${ts}-${sanitizeFilename(filename)}`;
}

export default function StudentActivityView({
  classId,
  activity,
  currentUserId,
  attachments,
}: StudentActivityViewProps) {
  const router = useRouter();
  const submission = activity.submission;
  const grade = activity.grade;

  // ----- New lifecycle logic -----
  //
  // Three states the student can be in:
  //
  //   1. NO ROW: never touched the activity. Show empty composer.
  //   2. DRAFT (submission.isDraft=true): in-progress, owner-only. Show
  //      composer pre-filled, with "Save draft" + "Submit" buttons and
  //      a "Discard draft" option.
  //   3. FINAL (submission.isDraft=false): locked. Show read-only view.
  //      If attempts remain (attemptNumber < maxAttempts), show a
  //      "Start new attempt" button that opens a fresh composer for
  //      the next attempt (will replace the prior as the canonical
  //      submission once submitted).
  //
  // The old "edit until graded" model is gone. Once submitted = locked.
  //
  // canStartNewAttempt: submission is final AND attempts remain.

  const isDraft = submission?.isDraft === true;
  const isFinalSubmission = submission !== null && !isDraft;

  const attemptsUsed = isFinalSubmission ? submission!.attemptNumber : 0;
  const attemptsRemaining = Math.max(0, activity.maxAttempts - attemptsUsed);
  const canStartNewAttempt = isFinalSubmission && attemptsRemaining > 0;

  // composing: the student has the composer open (whether for a fresh
  // first submission, a draft they're editing, or a new attempt).
  const [composing, setComposing] = useState(!submission || isDraft);

  // Track whether the current composer session is for a NEW attempt
  // (i.e. there's already a final submission, but the student clicked
  // "Start new attempt"). This affects copy + which button labels show.
  const [composingNewAttempt, setComposingNewAttempt] = useState(false);

  // Pre-fill text body from existing draft if any. New attempts start blank.
  const [textBody, setTextBody] = useState(
    isDraft ? (submission!.textBody ?? '') : '',
  );

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmNewAttempt, setConfirmNewAttempt] = useState(false);

  const showsTextField =
    activity.submissionType === 'text' || activity.submissionType === 'both';
  const showsFileField =
    activity.submissionType === 'file' || activity.submissionType === 'both';
  const isNoSubmission = activity.submissionType === 'none';

  const now = Date.now();
  const dueAt = new Date(activity.dueAt).getTime();
  const isPastDue = now > dueAt;
  const blockedByDeadline = isPastDue && !activity.allowLate;

  // Existing draft attachments — shown in the composer so student knows
  // what's already attached. They can still add more or, on submit, the
  // server-side will replace them with the new set (matches RPC logic).
  const existingDraftAttachments = isDraft
    ? (submission!.attachments ?? [])
    : [];

  function handleAddFiles(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function handleRemovePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleDownloadAttachment(attachmentId: string) {
    try {
      const url = await getSignedSubmissionAttachmentUrl(attachmentId);
      window.open(url, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch download.');
    }
  }

  async function uploadFilesToStorage(): Promise<SubmissionAttachmentInput[]> {
    if (pendingFiles.length === 0) return [];
    const supabase = createBrowserClient();
    const uploaded: SubmissionAttachmentInput[] = [];

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      setUploadProgress(
        `Uploading ${i + 1} of ${pendingFiles.length}: ${file.name}`,
      );
      const path = buildStoragePath(
        classId,
        activity.id,
        currentUserId,
        file.name,
      );
      const { error: upErr } = await supabase.storage
        .from('submission-attachments')
        .upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (upErr) {
        throw new Error(`Failed to upload "${file.name}": ${upErr.message}`);
      }
      uploaded.push({
        path,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      });
    }

    setUploadProgress(null);
    return uploaded;
  }

  // --- Validation shared by saveDraft + submit ---
  function validateForSubmit(): string | null {
    if (blockedByDeadline) {
      return 'The deadline has passed and late submissions are not allowed.';
    }
    if (
      activity.submissionType === 'both' &&
      !textBody.trim() &&
      pendingFiles.length === 0 &&
      existingDraftAttachments.length === 0
    ) {
      return 'Please provide a text response or attach a file.';
    }
    if (showsTextField && !textBody.trim() && !showsFileField) {
      return 'Submission cannot be empty.';
    }
    if (
      showsFileField &&
      !showsTextField &&
      pendingFiles.length === 0 &&
      existingDraftAttachments.length === 0
    ) {
      return 'Please attach at least one file.';
    }
    return null;
  }

  function handleSaveDraft() {
    setError(null);
    setNotice(null);

    if (blockedByDeadline) {
      setError(
        'The deadline has passed and late submissions are not allowed.',
      );
      return;
    }

    // Drafts have no content requirement — student can save an empty one.
    // The only thing we block is past-due+!allowLate, since otherwise
    // they'd be stuck with a draft they can never convert.

    startTransition(async () => {
      try {
        const uploaded = showsFileField ? await uploadFilesToStorage() : [];
        await submitActivity(
          activity.id,
          showsTextField ? textBody : '',
          uploaded,
          { isDraft: true },
        );

        setPendingFiles([]);
        setNotice('Draft saved. You can come back and finish it later.');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save draft.');
        setUploadProgress(null);
      }
    });
  }

  function handleSubmit() {
    setError(null);
    setNotice(null);

    const validationErr = validateForSubmit();
    if (validationErr) {
      setError(validationErr);
      return;
    }

    startTransition(async () => {
      try {
        const uploaded = showsFileField ? await uploadFilesToStorage() : [];
        const result = await submitActivity(
          activity.id,
          showsTextField ? textBody : '',
          uploaded,
          { isDraft: false },
        );

        setPendingFiles([]);
        setComposing(false);
        setComposingNewAttempt(false);

        if (result.replacedGrade) {
          setNotice(
            'Submitted. Your previous grade was cleared and the teacher will re-grade.',
          );
        } else if (result.isLate) {
          setNotice('Submitted as a late submission.');
        } else {
          setNotice('Submitted.');
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit.');
        setUploadProgress(null);
      }
    });
  }

  function handleStartNewAttempt() {
    // Opens a fresh composer for the next attempt. Doesn't write to the
    // server yet — the new draft/submission row is created when the
    // student saves draft or submits.
    setError(null);
    setNotice(null);
    setTextBody('');
    setPendingFiles([]);
    setComposing(true);
    setComposingNewAttempt(true);
    setConfirmNewAttempt(false);
  }

  function handleCancelComposing() {
    setError(null);
    setNotice(null);
    setPendingFiles([]);
    if (isDraft) {
      // Reset draft text to what's saved on server.
      setTextBody(submission!.textBody ?? '');
    } else {
      setTextBody('');
    }
    // Only close the composer if there's something to fall back to
    // (either a draft or a final submission). Otherwise the composer
    // is the only thing to show.
    if (submission) {
      setComposing(false);
      setComposingNewAttempt(false);
    }
  }

  async function handleConfirmDiscard() {
    setError(null);
    setNotice(null);
    try {
      await discardDraft(activity.id);
      setTextBody('');
      setPendingFiles([]);
      setConfirmDiscard(false);
      // After discarding, there might still be a prior final submission
      // (if this was a "new attempt" draft). Or there might be nothing.
      // Let router.refresh() resolve which state we end up in.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to discard draft.');
    }
  }

    // What's the headline state shown to the student right now?
  // Determines which panels render below.
  const showComposer = composing || (!submission && !isNoSubmission);
  const showFinalSubmissionView =
    isFinalSubmission && !composing && !composingNewAttempt;

  const releasedGrade = grade && grade.returnedAt ? grade : null;

  // Status pill shown next to the title (matches the Activities list).
  const statusPill: { label: string; className: string } = releasedGrade
    ? { label: 'Graded', className: 'bg-green-50 text-green-700' }
    : isFinalSubmission
      ? submission!.isLate
        ? { label: 'Submitted late', className: 'bg-blue-50 text-blue-700' }
        : { label: 'Submitted', className: 'bg-blue-50 text-blue-700' }
      : isDraft
        ? { label: 'Draft', className: 'bg-gray-100 text-gray-700' }
        : blockedByDeadline
          ? { label: 'Missed', className: 'bg-red-50 text-red-700' }
          : { label: 'To do', className: 'bg-amber-50 text-amber-700' };

  const dueLabel = new Date(activity.dueAt).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-700">
            Activity
          </span>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase text-blue-700">
            {MODULE_TERM_LABELS[activity.term]}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusPill.className}`}>
            {statusPill.label}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{activity.title}</h1>
        <p className="text-sm text-gray-600">
          Due {dueLabel} · {activity.maxPoints} points ·{' '}
          {SUBMISSION_TYPE_LABELS[activity.submissionType]}
          {activity.allowLate && ' · Late submissions accepted'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ---------------- Left: the work ---------------- */}
        <div className="min-w-0 space-y-6">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* Instructions + Questions / Tasks in one card */}
          {(activity.instructions.trim() || activity.prompt.trim()) && (
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {activity.instructions.trim() && (
                <div className="border-b border-gray-100 px-5 py-4 last:border-b-0">
                  <h2 className="mb-2 text-[15px] font-bold text-gray-900">
                    Instructions
                  </h2>
                  <MarkdownContent body={activity.instructions} />
                </div>
              )}
              {activity.prompt.trim() && (
                <div className="px-5 py-4">
                  <h2 className="mb-2 text-[15px] font-bold text-gray-900">
                    Questions / Tasks
                  </h2>
                  <MarkdownContent body={activity.prompt} />
                </div>
              )}
            </section>
          )}

          {/* Attachments (teacher-uploaded reference files) */}
          {attachments.length > 0 && (
            <StudentActivityAttachmentsList attachments={attachments} />
          )}

          {/* Submission area */}
          {isNoSubmission ? (
            <section className="rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-600">
                This activity does not require a submission. Your teacher will
                grade it directly.
              </p>
            </section>
          ) : showFinalSubmissionView ? (
            <FinalSubmissionView
              submission={submission!}
              activity={activity}
              hasReleasedGrade={releasedGrade !== null}
              attemptsRemaining={attemptsRemaining}
              canStartNewAttempt={canStartNewAttempt}
              onStartNewAttempt={() => setConfirmNewAttempt(true)}
              onDownload={handleDownloadAttachment}
            />
          ) : showComposer ? (
            <ComposerView
              showsTextField={showsTextField}
              showsFileField={showsFileField}
              textBody={textBody}
              onTextChange={setTextBody}
              pendingFiles={pendingFiles}
              onAddFiles={handleAddFiles}
              onRemoveFile={handleRemovePendingFile}
              existingDraftAttachments={existingDraftAttachments}
              onDownloadExisting={handleDownloadAttachment}
              isPending={isPending}
              uploadProgress={uploadProgress}
              blockedByDeadline={blockedByDeadline}
              isPastDue={isPastDue}
              allowLate={activity.allowLate}
              isDraft={isDraft}
              composingNewAttempt={composingNewAttempt}
              attemptNumber={
                composingNewAttempt
                  ? attemptsUsed + 1
                  : isDraft
                    ? submission!.attemptNumber
                    : 1
              }
              maxAttempts={activity.maxAttempts}
              onSaveDraft={handleSaveDraft}
              onSubmit={handleSubmit}
              onDiscardDraft={isDraft ? () => setConfirmDiscard(true) : undefined}
              onCancel={
                submission && (isDraft || composingNewAttempt)
                  ? handleCancelComposing
                  : undefined
              }
            />
          ) : null}
        </div>

        {/* ---------------- Right: grade + details ---------------- */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-gray-900">Your grade</h2>
                {releasedGrade && (
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
                    Released{' '}
                    {new Date(releasedGrade.returnedAt!).toLocaleDateString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </div>

              {releasedGrade ? (
                <div className="flex items-center gap-4">
                  <ScoreRing score={releasedGrade.score} max={activity.maxPoints} />
                  <div>
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold leading-none text-gray-900">
                        {releasedGrade.score}
                      </span>
                      <span className="text-base text-gray-600">
                        / {activity.maxPoints}
                      </span>
                    </p>
                  </div>
                </div>
              ) : isFinalSubmission ? (
                <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                  <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <p>
                    Submitted. Waiting for your teacher to grade it. Your score
                    will show here once it&apos;s released.
                  </p>
                </div>
              ) : isDraft ? (
                <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                  <FileEdit className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <p>Draft saved, not submitted yet. Submit it so your teacher can grade it.</p>
                </div>
              ) : blockedByDeadline ? (
                <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>The deadline has passed and late submissions are not accepted.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  {isNoSubmission
                    ? 'Your teacher will grade this directly.'
                    : 'Not submitted yet. Your score will show here after your teacher grades it.'}
                </p>
              )}
            </div>

            {releasedGrade && releasedGrade.feedback.trim() && (
              <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Teacher feedback
                </p>
                <div className="text-sm text-gray-800">
                  <MarkdownContent body={releasedGrade.feedback} />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-gray-900">Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
              <dt className="text-gray-500">Due</dt>
              <dd className="text-right font-semibold text-gray-900">{dueLabel}</dd>
              <dt className="text-gray-500">Points</dt>
              <dd className="text-right font-semibold text-gray-900">{activity.maxPoints}</dd>
              <dt className="text-gray-500">Submit as</dt>
              <dd className="text-right font-semibold text-gray-900">
                {SUBMISSION_TYPE_LABELS[activity.submissionType]}
              </dd>
              {activity.maxAttempts > 1 && (
                <>
                  <dt className="text-gray-500">Attempts</dt>
                  <dd className="text-right font-semibold text-gray-900">
                    {attemptsUsed} of {activity.maxAttempts} used
                  </dd>
                </>
              )}
              <dt className="text-gray-500">Late work</dt>
              <dd
                className={`text-right font-semibold ${
                  activity.allowLate ? 'text-amber-700' : 'text-gray-900'
                }`}
              >
                {activity.allowLate ? 'Accepted' : 'Not accepted'}
              </dd>
            </dl>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard draft?"
        message="Your in-progress draft, including any uploaded files, will be permanently deleted. This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={handleConfirmDiscard}
        onClose={() => setConfirmDiscard(false)}
      />

      <ConfirmDialog
        open={confirmNewAttempt}
        title="Start a new attempt?"
        message={`You'll be working on attempt ${attemptsUsed + 1} of ${activity.maxAttempts}. Your current submission stays in place until you submit the new one — but once you do, the new attempt replaces it as your graded submission.`}
        confirmLabel="Start new attempt"
        onConfirm={handleStartNewAttempt}
        onClose={() => setConfirmNewAttempt(false)}
      />
    </div>
  );
}

// ==========================================================================
// Score ring (right panel)
// ==========================================================================

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((score / max) * 100))) : 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;
  return (
    <svg role="img" aria-label={`${pct} percent`} width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#f4f4f5" strokeWidth="10" />
      {pct > 0 && (
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="#dc2626"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 44 44)"
        />
      )}
      <text x="44" y="50" textAnchor="middle" fontSize="18" fontWeight="800" fill="#18181b">
        {pct}%
      </text>
    </svg>
  );
}
// ==========================================================================
// Final (locked) submission view
// ==========================================================================

interface FinalSubmissionViewProps {
  submission: ActivitySubmission;
  activity: ActivityWithStudentState;
  hasReleasedGrade: boolean;
  attemptsRemaining: number;
  canStartNewAttempt: boolean;
  onStartNewAttempt: () => void;
  onDownload: (attachmentId: string) => void;
}

function FinalSubmissionView({
  submission,
  activity,
  hasReleasedGrade,
  attemptsRemaining,
  canStartNewAttempt,
  onStartNewAttempt,
  onDownload,
}: FinalSubmissionViewProps) {
  return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">
            Your submission
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            <span>
              Submitted {new Date(submission.submittedAt).toLocaleString()}
            </span>
            {submission.isLate && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Late
              </span>
            )}
            {activity.maxAttempts > 1 && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                Attempt {submission.attemptNumber} of {activity.maxAttempts}
              </span>
            )}
          </p>
        </div>
        {canStartNewAttempt && (
          <button
            type="button"
            onClick={onStartNewAttempt}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <RefreshCw className="h-3 w-3" />
            Start new attempt ({attemptsRemaining} left)
          </button>
        )}
      </div>

      {submission.textBody?.trim() && (
        <div className="mb-3 rounded-md border border-gray-100 bg-gray-50 p-3">
          <p className="whitespace-pre-wrap text-sm text-gray-800">
            {submission.textBody}
          </p>
        </div>
      )}

      {submission.attachments.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Attachments
          </h3>
          <ul className="space-y-1">
            {submission.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-3 py-2 text-sm"
              >
                <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                <span className="flex-1 truncate text-gray-700">
                  {a.fileName}
                </span>
                <span className="text-xs text-gray-400">
                  {(a.fileSize / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => onDownload(a.id)}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label={`Download ${a.fileName}`}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status footer */}
      <div className="mt-3 border-t border-gray-100 pt-3 text-xs">
        {hasReleasedGrade ? (
          canStartNewAttempt ? (
            <p className="text-gray-600">
              This attempt has been graded. You have {attemptsRemaining}{' '}
              attempt{attemptsRemaining === 1 ? '' : 's'} remaining if you
              want to revise — starting a new attempt will replace this one
              as your graded submission.
            </p>
          ) : (
            <p className="italic text-gray-500">
              This submission has been graded.
              {activity.maxAttempts > 1
                ? " You've used all your attempts."
                : ' Only one attempt is allowed for this activity.'}
            </p>
          )
        ) : canStartNewAttempt ? (
          <p className="text-gray-600">
            Waiting for your teacher to grade this. You can also start a new
            attempt — {attemptsRemaining} remaining.
          </p>
        ) : (
          <p className="italic text-gray-500">
            Waiting for your teacher to grade this.
            {activity.maxAttempts > 1
              ? " You've used all your attempts."
              : ''}
          </p>
        )}
      </div>
    </section>
  );
}

// ==========================================================================
// Composer (handles fresh submission, draft editing, AND new attempts)
// ==========================================================================

interface ComposerProps {
  showsTextField: boolean;
  showsFileField: boolean;
  textBody: string;
  onTextChange: (v: string) => void;
  pendingFiles: File[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  existingDraftAttachments: ActivitySubmission['attachments'];
  onDownloadExisting: (attachmentId: string) => void;
  isPending: boolean;
  uploadProgress: string | null;
  blockedByDeadline: boolean;
  isPastDue: boolean;
  allowLate: boolean;
  isDraft: boolean;
  composingNewAttempt: boolean;
  attemptNumber: number;
  maxAttempts: number;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onDiscardDraft?: () => void;
  onCancel?: () => void;
}

function ComposerView({
  showsTextField,
  showsFileField,
  textBody,
  onTextChange,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  existingDraftAttachments,
  onDownloadExisting,
  isPending,
  uploadProgress,
  blockedByDeadline,
  isPastDue,
  allowLate,
  isDraft,
  composingNewAttempt,
  attemptNumber,
  maxAttempts,
  onSaveDraft,
  onSubmit,
  onDiscardDraft,
  onCancel,
}: ComposerProps) {
  let headline: string;
  if (composingNewAttempt) {
    headline = `Attempt ${attemptNumber} of ${maxAttempts}`;
  } else if (isDraft) {
    headline = 'Continue your draft';
  } else {
    headline =
      maxAttempts > 1
        ? `Your submission (attempt ${attemptNumber} of ${maxAttempts})`
        : 'Your submission';
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {isDraft && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-800">
              <FileEdit className="-mt-0.5 mr-1 inline h-3 w-3" />
              Draft
            </span>
          )}
          {headline}
        </h2>
        {isDraft && (
          <span className="text-xs italic text-gray-500">
            Only you can see this until you submit.
          </span>
        )}
      </div>

      {blockedByDeadline ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          The deadline has passed and late submissions are not allowed for this
          activity.
        </div>
      ) : (
        <>
          {isPastDue && allowLate && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The deadline has passed. Your submission will be marked as late.
            </p>
          )}

          {showsTextField && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Text response
              </label>
              <textarea
                value={textBody}
                onChange={(e) => onTextChange(e.target.value)}
                disabled={isPending}
                rows={6}
                placeholder="Type your answer here…"
                className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
              />
            </div>
          )}

          {showsFileField && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Attachments
              </label>

              {/* Existing draft attachments — show as a "already attached"
                  list. Note: server-side, on next submit these get replaced
                  by whatever's freshly uploaded. The student should know. */}
              {existingDraftAttachments.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-xs text-gray-500">
                    Already in your draft:
                  </p>
                  <ul className="space-y-1">
                    {existingDraftAttachments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded-md border border-gray-100 bg-blue-50/40 px-3 py-1.5 text-sm"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                        <span className="flex-1 truncate text-gray-700">
                          {a.fileName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {(a.fileSize / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => onDownloadExisting(a.id)}
                          className="rounded p-0.5 text-gray-500 hover:bg-white"
                          aria-label={`Download ${a.fileName}`}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {pendingFiles.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Note: when you save or submit, your draft&apos;s files
                      will be replaced with the ones below.
                    </p>
                  )}
                </div>
              )}

              {pendingFiles.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {pendingFiles.map((file, idx) => (
                    <li
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm"
                    >
                      <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                      <span className="flex-1 truncate text-gray-700">
                        {file.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveFile(idx)}
                        disabled={isPending}
                        className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        aria-label="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                Choose file{pendingFiles.length > 0 ? 's to add' : 's'}
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => onAddFiles(e.target.files)}
                  disabled={isPending}
                />
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Up to 25 MB per file.
              </p>
            </div>
          )}

          {uploadProgress && (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {uploadProgress}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2">
              {onDiscardDraft && (
                <button
                  type="button"
                  onClick={onDiscardDraft}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Discard draft
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isPending}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save draft
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Submit
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs italic text-gray-500">
            <strong>Save draft</strong> keeps your work in progress (only you
            can see it). <strong>Submit</strong> sends it to your teacher and
            locks this attempt.
          </p>
        </>
      )}
    </section>
  );
}