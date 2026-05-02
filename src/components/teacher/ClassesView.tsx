'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import ClassCard from './ClassCard';
import CreateClassModal from './CreateClassModal';
import type { ClassRow } from '@/types/class';

interface ClassesViewProps {
  initialClasses: ClassRow[];
  compact?: boolean;
}

export default function ClassesView({
  initialClasses,
  compact = false,
}: ClassesViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleCreated() {
    startTransition(() => router.refresh());
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className={
            compact
              ? 'text-xl font-semibold text-gray-900'
              : 'text-2xl font-bold text-gray-900'
          }
        >
          My classes
        </h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          <Plus size={16} />
          Create class
        </button>
      </div>

      {initialClasses.length === 0 ? (
        <EmptyState onCreate={() => setModalOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {initialClasses.map((c) => (
            <ClassCard key={c.id} classRow={c} />
          ))}
        </div>
      )}

      <CreateClassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </section>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <Plus className="h-7 w-7 text-red-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">No classes yet</h2>
      <p className="mt-1 max-w-sm text-sm text-gray-600">
        Create your first class to start organizing students, sharing
        materials, and managing assignments.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
      >
        <Plus size={16} />
        Create your first class
      </button>
    </div>
  );
}