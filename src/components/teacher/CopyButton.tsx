'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}
export function CopyButton({ text, label, className, disabled }: CopyButtonProps) {
const [copied, setCopied] = useState(false);
async function handleCopy() {
if (disabled) return;
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
disabled={disabled}
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