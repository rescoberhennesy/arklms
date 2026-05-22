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
import { getAttachmentDownloadData } from '@/lib/actions/modules';

interface LessonAttachmentPreviewProps {
  attachmentId: string;
  fileName: string;
  mimeType: string | null;
}

type PreviewKind =
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
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
  return 'unsupported';
}

/**
 * Inline preview component for a single lesson attachment.
 * Used by both the teacher LessonEditor and the StudentLessonView.
 *
 * Collapsed by default; clicking "Preview" expands an inline viewer
 * appropriate to the file type. The file data is fetched lazily on
 * first expand and cached as a base64 data URL for the rest of the
 * session.
 *
 * For unsupported types (Word, Excel, PPT, archives, etc.) the preview
 * button is hidden and only the parent's Download button remains.
 */
export default function LessonAttachmentPreview({
  attachmentId,
  fileName,
  mimeType,
}: LessonAttachmentPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind = detectPreviewKind(mimeType, fileName);
  const canPreview = kind !== 'unsupported';

  async function ensureData(): Promise<string | null> {
    if (dataUrl) return dataUrl;
    try {
      const result = await getAttachmentDownloadData(attachmentId);
      setDataUrl(result.dataUrl);
      return result.dataUrl;
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

    const url = await ensureData();
    if (!url) {
      setLoading(false);
      return;
    }

    // For text-like files we decode the base64 once and render in a <pre>.
    // For everything else, the data URL goes straight into an iframe /
    // img / video tag, so no extra work is needed here.
    if (kind === 'text' && textBody === null) {
      try {
        // Data URL is `data:<mime>;base64,<payload>` — decode the payload.
        const base64 = url.split(',')[1] ?? '';
        const body = atob(base64);
        // Cap rendered text at ~200KB — anything bigger and we just
        // show the first chunk with a note. Browsers can handle more,
        // but a 5MB log file in a <pre> tanks the page.
        const MAX_TEXT_CHARS = 200_000;
        if (body.length > MAX_TEXT_CHARS) {
          setTextBody(
            body.slice(0, MAX_TEXT_CHARS) +
              '\n\n…\n[File truncated for preview — download to view in full]',
          );
        } else {
          setTextBody(body);
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not decode file contents.',
        );
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
        <div className="col-span-full mt-2 w-full overflow-hidden rounded-md border border-gray-200 bg-white">
          {error ? (
            <div className="flex items-start gap-2 px-3 py-3 text-xs text-red-700">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : loading || !dataUrl ? (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          ) : (
            <PreviewBody
              kind={kind}
              url={dataUrl}
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