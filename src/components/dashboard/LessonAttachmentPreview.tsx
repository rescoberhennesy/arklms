'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { getAttachmentSignedUrl } from '@/lib/actions/modules';

interface LessonAttachmentPreviewProps {
  attachmentId: string;
  fileName: string;
  mimeType: string | null;
  /** Optional custom link getter (e.g. activity attachments). Defaults to lesson attachments. */
  getUrl?: () => Promise<string | { url: string }>;
}

type PreviewKind =
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'office'
  | 'unsupported';

function detectPreviewKind(
  mimeType: string | null,
  fileName: string,
): PreviewKind {
  const mt = (mimeType ?? '').toLowerCase();
  const ext = fileName.toLowerCase().split('.').pop() ?? '';

  if (mt === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mt.startsWith('image/')) return 'image';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (mt.startsWith('video/')) return 'video';
  if (['mp4', 'webm', 'mov', 'ogv'].includes(ext)) return 'video';
  if (mt.startsWith('audio/')) return 'audio';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (
    mt.startsWith('text/') ||
    ['txt', 'md', 'csv', 'json', 'log'].includes(ext)
  ) {
    return 'text';
  }
    if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return 'office';
  return 'unsupported';
}

// Signed links last 10 minutes on the server; refresh a bit before that.
const URL_TTL_MS = 9 * 60 * 1000;

/**
 * Inline preview for a single lesson attachment.
 * Used by both the teacher LessonEditor and the StudentLessonView.
 *
 * Collapsed by default; clicking "Preview" asks the server for a short-lived
 * signed link and the browser loads the file straight from Supabase Storage.
 * (The old version sent the whole file through the server as a base64 data
 * URL, which Chrome refuses above ~2 MB — large PDFs showed up blank.)
 *
 * For unsupported types (Word, Excel, PPT, archives, etc.) the preview
 * button is hidden and only the parent's Download button remains.
 */
export default function LessonAttachmentPreview({
  attachmentId,
  fileName,
  mimeType,
  getUrl,
}: LessonAttachmentPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState<{ url: string; at: number } | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind = detectPreviewKind(mimeType, fileName);
  const canPreview = kind !== 'unsupported';

  async function ensureUrl(): Promise<string | null> {
    if (signed && Date.now() - signed.at < URL_TTL_MS) return signed.url;
    try {
            const result = getUrl ? await getUrl() : await getAttachmentSignedUrl(attachmentId);
      const url = typeof result === 'string' ? result : result.url;
      setSigned({ url, at: Date.now() });
      return url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load preview.');
      return null;
    }
  }

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setError(null);
    setLoading(true);
    setExpanded(true);

    const url = await ensureUrl();
    if (!url) {
      setLoading(false);
      return;
    }

    // Text-like files are fetched once and shown in a <pre>; everything else
    // loads directly from the signed link in an iframe / img / video tag.
    if (kind === 'text' && textBody === null) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load file (${res.status}).`);
        const body = await res.text();
        // Cap rendered text at ~200KB; a huge log file in a <pre> tanks the page.
        const MAX_TEXT_CHARS = 200_000;
        setTextBody(
          body.length > MAX_TEXT_CHARS
            ? body.slice(0, MAX_TEXT_CHARS) +
                '\n\n…\n[File truncated for preview — download to view in full]'
            : body,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read file contents.');
      }
    }

    setLoading(false);
  }

  if (!canPreview) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleExpand}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide preview' : 'Show preview'}
        title={expanded ? 'Hide preview' : 'Show preview'}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Eye className="h-3.5 w-3.5" />
        Preview
      </button>

      {expanded && (
          <div className="order-last col-span-full mt-2 w-full basis-full overflow-hidden rounded-md border border-gray-200 bg-white">
          {error ? (
            <div className="flex items-start gap-2 px-3 py-3 text-xs text-red-700">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : loading || !signed ? (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          ) : (
            <PreviewBody
              kind={kind}
              url={signed.url}
              fileName={fileName}
              textBody={textBody}
            />
          )}
        </div>
      )}
    </>
  );
}

function PreviewBody({
  kind,
  url,
  fileName,
  textBody,
}: {
  kind: PreviewKind;
  url: string;
  fileName: string;
  textBody: string | null;
}) {
  switch (kind) {
    case 'pdf':
      return (
        <iframe
          src={url}
          title={`Preview: ${fileName}`}
          className="h-[600px] w-full border-0 bg-gray-50"
        />
      );
    case 'image':
      return (
        <div className="flex items-center justify-center bg-gray-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={fileName}
            className="max-h-[600px] w-auto max-w-full rounded"
          />
        </div>
      );
    case 'video':
      return (
        <video
          src={url}
          controls
          className="w-full bg-black"
          style={{ maxHeight: 600 }}
        >
          Your browser doesn&apos;t support inline video playback.
        </video>
      );
    case 'audio':
      return (
        <div className="px-3 py-4">
          <audio src={url} controls className="w-full">
            Your browser doesn&apos;t support inline audio playback.
          </audio>
        </div>
      );
    case 'text':
      return (
        <pre className="max-h-[400px] overflow-auto bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-800">
          {textBody ?? ''}
        </pre>
      );
        case 'office':
      return (
        <div>
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
            title={`Preview: ${fileName}`}
            className="h-[600px] w-full border-0 bg-gray-50"
          />
          <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
            Previewed with Microsoft Office Online. If it doesn&apos;t load, use Download.
          </p>
        </div>
      );


    case 'unsupported':
    default:
      return (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500">
          <FileText className="h-3.5 w-3.5" />
          No inline preview is available for this file type.
        </div>
      );
  }
}