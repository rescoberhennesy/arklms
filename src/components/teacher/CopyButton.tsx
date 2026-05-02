'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be blocked
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/30'
      }
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
