'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { setClassArchived, deleteClass } from '@/lib/actions/classes';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsActionsProps {
  classId: string;
  className: string;
  isArchived: boolean;
}

export default function SettingsActions({
  classId,
  className,
  isArchived,
}: SettingsActionsProps) {
  const router = useRouter();
  const [archived, setArchived] = useState(isArchived);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggleArchive() {
    setError(null);
    startTransition(async () => {
      const res = await setClassArchived(classId, !archived);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setArchived(!archived);
      router.refresh();
    });
  }

  async function handleDelete() {
    setError(null);
    const res = await deleteClass(classId);
    if (!res.ok) {
      setError(res.error);
      throw new Error(res.error);
    }
    router.replace('/teacher/classes');
  }

  return (
    <div className="space-y-3">
      <ActionRow
        title={archived ? 'Class is archived' : 'Archive this class'}
        body={
          archived
            ? 'Restore the class to your active list. Students regain access to materials.'
            : 'Move this class to your archived list. Students keep access to past materials, but the class is hidden from active views.'
        }
        button={
          <button
            type="button"
            onClick={handleToggleArchive}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" />
                Unarchive
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                Archive
              </>
            )}
          </button>
        }
      />

      <ActionRow
        title="Delete this class"
        body="Permanently remove this class along with all enrollments, join requests, and content. This cannot be undone."
        button={
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete class
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete class permanently?"
        message={
          <p>
            This will permanently delete <strong>{className}</strong> and remove
            all enrollments, join requests, and content. This action cannot be
            undone.
          </p>
        }
        confirmLabel="Delete permanently"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function ActionRow({
  title,
  body,
  button,
}: {
  title: string;
  body: string;
  button: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-600">{body}</p>
      </div>
      <div className="shrink-0">{button}</div>
    </div>
  );
}
