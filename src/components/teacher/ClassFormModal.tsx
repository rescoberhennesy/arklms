// src/components/teacher/ClassFormModal.tsx
'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { X } from 'lucide-react';
import { CLASS_COLORS, type ClassFormInput, type ClassRow, type Semester } from '@/types/class';
import { cn } from '@/lib/utils/cn';

type Mode = { kind: 'create' } | { kind: 'edit'; cls: ClassRow };

interface ClassFormModalProps {
  open: boolean;
  mode: Mode;
  nameSuggestions: string[];
  sectionSuggestions: string[];
  onClose: () => void;
  onSubmit: (input: ClassFormInput) => Promise<void>;
}

const SEMESTERS: Semester[] = ['1st Semester', '2nd Semester'];

export function ClassFormModal({
  open,
  mode,
  nameSuggestions,
  sectionSuggestions,
  onClose,
  onSubmit,
}: ClassFormModalProps) {
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [semester, setSemester] = useState<Semester>('1st Semester');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(CLASS_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (mode.kind === 'edit') {
      setName(mode.cls.name);
      setSection(mode.cls.section ?? '');
      setSemester(mode.cls.semester);
      setDescription(mode.cls.description ?? '');
      setColor(mode.cls.color ?? CLASS_COLORS[0]);
    } else {
      setName('');
      setSection('');
      setSemester('1st Semester');
      setDescription('');
      setColor(CLASS_COLORS[0]);
    }
    setError(null);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Class name is required');
      return;
    }
    startTransition(async () => {
      try {
        await onSubmit({
          name: name.trim(),
          section: section.trim() || null,
          semester,
          description: description.trim() || null,
          color,
        });
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
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
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
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-8 w-8 rounded-full ring-offset-2 transition',
                    color === c ? 'ring-2 ring-gray-700' : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Cover photo upload coming soon — your selected color is used until then.
            </p>
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