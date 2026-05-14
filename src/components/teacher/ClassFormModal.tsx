// src/components/teacher/ClassFormModal.tsx
'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, ImagePlus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { setClassCoverUrl } from '@/lib/actions/classes';
import { CLASS_COLORS, type ClassFormInput, type ClassRow, type Semester } from '@/types/class';
import { cn } from '@/lib/utils/cn';
import ClassCover from '@/components/dashboard/ClassCover';

type Mode = { kind: 'create' } | { kind: 'edit'; cls: ClassRow };

interface ClassFormModalProps {
  open: boolean;
  mode: Mode;
  nameSuggestions: string[];
  sectionSuggestions: string[];
  onClose: () => void;
  onSubmit: (input: ClassFormInput) => Promise<ClassRow>;
}

const SEMESTERS: Semester[] = ['1st Semester', '2nd Semester'];

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

/**
 * Uploads `file` to class-covers/<classId>/cover.<ext> and persists the
 * resulting public URL via setClassCoverUrl. Shared by both create and edit
 * flows -- in create mode this runs *after* the class row exists.
 */
async function uploadCover(classId: string, file: File): Promise<void> {
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
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: pub } = supabase.storage.from('class-covers').getPublicUrl(path);
  const urlWithBuster = `${pub.publicUrl}?v=${Date.now()}`;

  const res = await setClassCoverUrl(classId, urlWithBuster);
  if (!res.ok) throw new Error(res.error);
}

export function ClassFormModal({
  open,
  mode,
  nameSuggestions,
  sectionSuggestions,
  onClose,
  onSubmit,
}: ClassFormModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [semester, setSemester] = useState<Semester>('1st Semester');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(CLASS_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cover-photo state.
  // `pendingFile` is a file the teacher chose but hasn't been uploaded yet
  // (always the case in create mode; also used in edit mode so the upload is
  // deferred to Save). `pendingPreviewUrl` is an object URL for the preview.
  // `existingUrl` is the already-saved cover (edit mode only).
  // `removeExisting` flags that the teacher wants the saved cover gone.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode.kind === 'edit') {
      setName(mode.cls.name);
      setSection(mode.cls.section ?? '');
      setSemester(mode.cls.semester);
      setDescription(mode.cls.description ?? '');
      setColor(mode.cls.color ?? CLASS_COLORS[0]);
      setExistingUrl(mode.cls.cover_photo_url);
    } else {
      setName('');
      setSection('');
      setSemester('1st Semester');
      setDescription('');
      setColor(CLASS_COLORS[0]);
      setExistingUrl(null);
    }
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setRemoveExisting(false);
    setError(null);
  }, [open, mode]);

  // Revoke the object URL when it changes or the modal closes -- avoids leaks.
  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError('Use a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is too large (${formatBytes(file.size)}). Max is 5 MB.`);
      return;
    }

    // Choosing a photo means the teacher wants a photo, not a color.
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(file);
    setPendingPreviewUrl(URL.createObjectURL(file));
    setRemoveExisting(false);
    setError(null);
  }

  function clearCover() {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    // If there's a saved cover, mark it for removal on Save.
    if (existingUrl) setRemoveExisting(true);
  }

  function handlePickColor(c: string) {
    setColor(c);
    // Picking a color drops any pending photo choice; a saved cover stays
    // until the teacher explicitly removes it (so a stray color tap doesn't
    // nuke their uploaded cover) -- but a *new* pending file is cleared.
    if (pendingFile || pendingPreviewUrl) {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingFile(null);
      setPendingPreviewUrl(null);
    }
  }

  // What the preview should show right now.
  const previewUrl = pendingPreviewUrl ?? (removeExisting ? null : existingUrl);
  const hasCoverChoice = !!previewUrl;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Class name is required');
      return;
    }
    startTransition(async () => {
      try {
        // 1. Create/update the class row first -- we need its id for storage.
        const saved = await onSubmit({
          name: name.trim(),
          section: section.trim() || null,
          semester,
          description: description.trim() || null,
          color,
        });

        // 2. Apply the cover-photo change, if any.
        if (pendingFile) {
          await uploadCover(saved.id, pendingFile);
        } else if (removeExisting && existingUrl) {
          const res = await setClassCoverUrl(saved.id, null);
          if (!res.ok) throw new Error(res.error);
        }

        // 3. If we touched the cover, refresh so the new URL is reflected
        //    in the card grid / class page (the parent's optimistic insert
        //    only knows the color).
        if (pendingFile || (removeExisting && existingUrl)) {
          router.refresh();
        }

        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  const isEdit = mode.kind === 'edit';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit class' : 'Create a class'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <AutocompleteField
            label="Class name"
            required
            value={name}
            onChange={setName}
            suggestions={nameSuggestions}
            placeholder="e.g. Introduction to Programming"
          />

          <AutocompleteField
            label="Section"
            value={section}
            onChange={setSection}
            suggestions={sectionSuggestions}
            placeholder="e.g. BSIT-1A"
          />

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">
              Semester <span className="text-red-500">*</span>
            </legend>
            <div className="flex gap-4">
              {SEMESTERS.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    semester === s
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <input
                    type="radio"
                    name="semester"
                    value={s}
                    checked={semester === s}
                    onChange={() => setSemester(s)}
                    className="h-4 w-4 accent-red-600"
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="Short description for students"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Card color
            </label>
            <div className="flex flex-wrap gap-2">
              {CLASS_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handlePickColor(c)}
                  className={cn(
                    'h-8 w-8 rounded-full ring-offset-2 transition',
                    color === c && !hasCoverChoice
                      ? 'ring-2 ring-gray-700'
                      : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>

            {/* ---- or ---- divider */}
            <div className="my-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                or
              </span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Cover photo
            </label>

            <ClassCover
              url={previewUrl}
              color={color}
              className="mb-2 h-28 w-full rounded-lg"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={pickFile}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" />
                {hasCoverChoice ? 'Change photo' : 'Upload cover photo'}
              </button>

              {hasCoverChoice && (
                <button
                  type="button"
                  onClick={clearCover}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              JPEG, PNG, or WebP, max 5 MB. A cover photo replaces the card
              color on the class card and the class page.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChosen}
              className="hidden"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create class'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface AutocompleteFieldProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}

function AutocompleteField({
  label,
  required,
  value,
  onChange,
  suggestions,
  placeholder,
}: AutocompleteFieldProps) {
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = suggestions
    .filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    .filter((s) => s.toLowerCase() !== value.toLowerCase())
    .slice(0, 6);

  const showDropdown = focused && filtered.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s);
                  setFocused(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}