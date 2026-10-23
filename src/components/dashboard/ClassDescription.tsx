'use client';

import { useState } from 'react';

export default function ClassDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180 || text.split('\n').length > 2;

  return (
    <div className="max-w-2xl">
      <p
        className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 ${
          !open && long ? 'line-clamp-2' : ''
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-semibold text-red-300 hover:text-red-200"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}