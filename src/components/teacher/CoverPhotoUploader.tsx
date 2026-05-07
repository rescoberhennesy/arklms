'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2, ImagePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { setClassCoverUrl } from '@/lib/actions/classes';
import ClassCover from '@/components/dashboard/ClassCover';

interface CoverPhotoUploaderProps {
  classId: string;
  color: string | null;
  currentUrl: string | null;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const TYPE_TO_EXT: Record<(typeof ALLOWED_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CoverPhotoUploader({
  classId,
  color,
  currentUrl,
}: CoverPhotoUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (e.target) e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError('Use a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is too large (${formatBytes(file.size)}). Max is 5 MB.`);
      return;
    }

    setBusy('upload');
    setError(null);

    try {
      const ext = TYPE_TO_EXT[file.type as (typeof ALLOWED_TYPES)[number]];
      const path = `${classId}/cover.${ext}`;
      const supabase = createClient();

      const { error: uploadErr } = await supabase
        .storage
        .from('class-covers')
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });

      if (uploadErr) {
        setError(uploadErr.message);
        return;
      }

      const { data: pub } = supabase
        .storage
        .from('class-covers')
        .getPublicUrl(path);

      const urlWithBuster = `${pub.publicUrl}?v=${Date.now()}`;

      const res = await setClassCoverUrl(classId, urlWithBuster);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    if (!currentUrl) return;
    setBusy('remove');
    setError(null);
    try {
      const res = await setClassCoverUrl(classId, null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setBusy(null);
    }
  }

  const hasCover = !!currentUrl;
  const isBusy = busy !== null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Cover photo</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            JPEG, PNG, or WebP. Max 5 MB.
          </p>
        </div>

      </div>

      <ClassCover
        url={currentUrl}
        color={color}
        className="mb-3 h-28 w-full rounded-lg"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={pickFile}
          disabled={isBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {hasCover ? (
            <>
              <Upload className="h-4 w-4" />
              {busy === 'upload' ? 'Uploading…' : 'Replace'}
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4" />
              {busy === 'upload' ? 'Uploading…' : 'Upload cover'}
            </>
          )}
        </button>

        {hasCover && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {busy === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChosen}
        className="hidden"
      />
    </div>
  );
}
