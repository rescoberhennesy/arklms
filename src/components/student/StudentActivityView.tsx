'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Award,
  Paperclip,
  Upload,
  X,
  Loader2,
  Send,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import MarkdownContent from '@/components/dashboard/MarkdownContent';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import {
  submitActivity,
  getSignedSubmissionAttachmentUrl,
} from '@/lib/actions/activities';
import {
  type ActivityWithStudentState,
  type SubmissionAttachmentInput,
  SUBMISSION_TYPE_LABELS,
} from '@/lib/types/activities';

interface StudentActivityViewProps {
  classId: string;
  activity: ActivityWithStudentState;
  currentUserId: string;
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
}: StudentActivityViewProps) {
  const router = useRouter();
  const submission = activity.submission;
  const grade = activity.grade;

  // Editing state. If they already submitted and can't resubmit, this is
  // permanently false (read-only view). Otherwise, default to false (show
  // their submission) and flip to true via "Edit"/"Resubmit" buttons.
  const canEdit =
    !submission || // no prior submission yet
    !grade || // submitted but not graded yet
    activity.allowResubmission; // graded but resubmission allowed

  const [editing, setEditing] = useState(!submission);

  // Composer state (only used when editing)
  const [textBody, setTextBody] = useState(submission?.textBody ?? '');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showsTextField =
    activity.submissionType === 'text' || activity.submissionType === 'both';
  const showsFileField =
    activity.submissionType === 'file' || activity.submissionType === 'both';
  const isNoSubmission = activity.submissionType === 'none';

  const now = Date.now();
  const dueAt = new Date(activity.dueAt).getTime();
  const isPastDue = now > dueAt;
  const blockedByDeadline = isPastDue && !activity.allowLate;

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
        throw new Error(
          `Failed to upload "${file.name}": ${upErr.message}`,
        );
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

  function handleSubmit() {
    setError(null);

    if (blockedByDeadline) {
      setError('The deadline has passed and late submissions are not allowed.');
      return;
    }

    if (showsTextField && !textBody.trim() && !showsFileField) {
      setError('Submission cannot be empty.');
      return;
    }
    if (showsFileField && pendingFiles.length === 0 && !showsTextField) {
      setError('Please attach at least one file.');
      return;
    }
    if (
      activity.submissionType === 'both' &&
      !textBody.trim() &&
      pendingFiles.length === 0
    ) {
      setError('Please provide a text response or attach a file.');
      return;
    }

    startTransition(async () => {
      try {
        const uploaded = showsFileField ? await uploadFilesToStorage() : [];
        const result = await submitActivity(
          activity.id,
          showsTextField ? textBody : '',
          uploaded,
        );

        setPendingFiles([]);
        setEditing(false);

        if (result.replacedGrade) {
          setError(
            'Submitted. Your previous grade was cleared and the teacher will re-grade.',
          );
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit.');
        setUploadProgress(null);
      }
    });
  }

  function handleStartEdit() {
    setError(null);
    setTextBody(submission?.textBody ?? '');
    setPendingFiles([]);
    setEditing(true);
  }

  function handleCancelEdit() {
    setTextBody(submission?.textBody ?? '');
    setPendingFiles([]);
    setError(null);
    setEditing(false);
  }

  // ---- Render ---------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{activity.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Due {new Date(activity.dueAt).toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <Award className="h-3 w-3" />
            {activity.maxPoints} pts
          </span>
          <span>{SUBMISSION_TYPE_LABELS[activity.submissionType]}</span>
          {activity.allowLate && (
            <span className="text-amber-600">Late submissions accepted</span>
          )}
          {activity.allowResubmission && (
            <span className="text-blue-600">Resubmission allowed</span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Description */}
      {activity.description.trim() && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Instructions
          </h2>
          <MarkdownContent body={activity.description} />
        </section>
      )}

      {/* Grade (if returned) */}
      {grade && grade.returnedAt && (
        <section className="rounded-xl border border-green-200 bg-green-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-green-800">
              Your grade
            </h2>
            <div className="text-right">
              <span className="text-2xl font-bold text-green-900">
                {grade.score}
              </span>
              <span className="text-sm text-green-700">
                {' '}
                / {activity.maxPoints}
              </span>
            </div>
          </div>
          {grade.feedback.trim() && (
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-green-700">
                Feedback
              </h3>
              <div className="rounded-md bg-white p-3">
                <MarkdownContent body={grade.feedback} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Submission area */}
      {isNoSubmission ? (
        <section className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-600">
            This activity does not require a submission. Your teacher will
            grade it directly.
          </p>
        </section>
      ) : !editing && submission ? (
        <ReadOnlySubmissionView
          submission={submission}
          canEdit={canEdit}
          allowResubmission={activity.allowResubmission}
          hasGrade={grade !== null}
          onEdit={handleStartEdit}
          onDownload={handleDownloadAttachment}
        />
      ) : (
        <ComposerView
          showsTextField={showsTextField}
          showsFileField={showsFileField}
          textBody={textBody}
          onTextChange={setTextBody}
          pendingFiles={pendingFiles}
          onAddFiles={handleAddFiles}
          onRemoveFile={handleRemovePendingFile}
          isPending={isPending}
          uploadProgress={uploadProgress}
          blockedByDeadline={blockedByDeadline}
          isPastDue={isPastDue}
          allowLate={activity.allowLate}
          hasExistingSubmission={submission !== null}
          onSubmit={handleSubmit}
          onCancel={submission ? handleCancelEdit : undefined}
        />
      )}
    </div>
  );
}

// ==========================================================================
// Read-only submission view
// ==========================================================================

interface ReadOnlySubmissionProps {
  submission: NonNullable<ActivityWithStudentState['submission']>;
  canEdit: boolean;
  allowResubmission: boolean;
  hasGrade: boolean;
  onEdit: () => void;
  onDownload: (attachmentId: string) => void;
}

function ReadOnlySubmissionView({
  submission,
  canEdit,
  allowResubmission,
  hasGrade,
  onEdit,
  onDownload,
}: ReadOnlySubmissionProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Your submission
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            <CheckCircle2 className="mr-1 inline h-3 w-3 text-green-600" />
            Submitted {new Date(submission.submittedAt).toLocaleString()}
            {submission.isLate && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Late
              </span>
            )}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {hasGrade && allowResubmission ? 'Resubmit' : 'Edit'}
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

      {hasGrade && !allowResubmission && (
        <p className="mt-3 text-xs italic text-gray-500">
          This submission has been graded. Resubmission is not allowed for this
          activity.
        </p>
      )}
    </section>
  );
}

// ==========================================================================
// Composer
// ==========================================================================

interface ComposerProps {
  showsTextField: boolean;
  showsFileField: boolean;
  textBody: string;
  onTextChange: (v: string) => void;
  pendingFiles: File[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  isPending: boolean;
  uploadProgress: string | null;
  blockedByDeadline: boolean;
  isPastDue: boolean;
  allowLate: boolean;
  hasExistingSubmission: boolean;
  onSubmit: () => void;
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
  isPending,
  uploadProgress,
  blockedByDeadline,
  isPastDue,
  allowLate,
  hasExistingSubmission,
  onSubmit,
  onCancel,
}: ComposerProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {hasExistingSubmission ? 'Edit your submission' : 'Your submission'}
      </h2>

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

          <div className="flex items-center justify-end gap-2">
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
              onClick={onSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {hasExistingSubmission ? 'Resubmit' : 'Submit'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}