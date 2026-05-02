'use client';

import { useEffect, useRef, useState, useTransition, useId } from 'react';
import { X } from 'lucide-react';
import {
  createClass,
  listMySectionSuggestions,
} from '@/lib/actions/classes';
import type { CreateClassInput } from '@/types/class';

interface CreateClassModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateClassModal({
  open,
  onClose,
  onCreated,
}: CreateClassModalProps) {
  const [form, setForm] = useState<CreateClassInput>({
    name: '',
    semester: '',
    section: '',
    subject_code: '',
    description: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sectionSuggestions, setSectionSuggestions] = useState<string[]>([]);
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const res = await listMySectionSuggestions();
      if (!cancelled && res.ok) setSectionSuggestions(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm({
        name: '',
        semester: '',
        section: '',
        subject_code: '',
        description: '',
      });
      setError(null);
      setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const filteredSuggestions = sectionSuggestions.filter((s) =>
    form.section
      ? s.toLowerCase().includes(form.section.toLowerCase()) && s !== form.section
      : true,
  );

  function handleChange<K extends keyof CreateClassInput>(
    key: K,
    value: CreateClassInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Class name is required.');
      return;
    }
    if (!form.semester.trim()) {
      setError('Semester is required.');
      return;
    }

    startTransition(async () => {
      const res = await createClass(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated?.();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${formId}-title`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id={`${formId}-title`} className="text-lg font-semibold text-gray-900">
            Create class
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <Field label="Class name" htmlFor={`${formId}-name`} required>
            <input
              ref={firstFieldRef}
              id={`${formId}-name`}
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Web Development"
              maxLength={200}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Section" htmlFor={`${formId}-section`}>
            <div className="relative">
              <input
                id={`${formId}-section`}
                type="text"
                value={form.section ?? ''}
                onChange={(e) => {
                  handleChange('section', e.target.value);
                  setShowSectionDropdown(true);
                }}
                onFocus={() => setShowSectionDropdown(true)}
                onBlur={() => {
                  setTimeout(() => setShowSectionDropdown(false), 150);
                }}
                placeholder="e.g., BSIT-3A"
                autoComplete="off"
                className={inputClass}
              />
              {showSectionDropdown && filteredSuggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {filteredSuggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChange('section', s);
                          setShowSectionDropdown(false);
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
          </Field>

          <Field label="Subject code" htmlFor={`${formId}-subject`}>
            <input
              id={`${formId}-subject`}
              type="text"
              value={form.subject_code ?? ''}
              onChange={(e) => handleChange('subject_code', e.target.value)}
              placeholder="e.g., IT-301"
              className={inputClass}
            />
          </Field>

          <Field label="Semester" htmlFor={`${formId}-semester`} required>
            <input
              id={`${formId}-semester`}
              type="text"
              value={form.semester}
              onChange={(e) => handleChange('semester', e.target.value)}
              placeholder="e.g., 1st Sem 2026-2027"
              required
              className={inputClass}
            />
          </Field>

          <Field label="Description" htmlFor={`${formId}-desc`}>
            <textarea
              id={`${formId}-desc`}
              value={form.description ?? ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Optional"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';