// src/lib/utils/markdownToPdf.ts
// Turns AI reviewer Markdown into a clean, downloadable PDF (in the browser).
// Handles what the reviewer uses: headings, paragraphs, bullet and numbered
// lists, quotes, **bold**, *italic* and `code`.

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

type Run = { text: string; bold?: boolean; italics?: boolean; font?: string };

// "**OT** is *cool* [link](url)" -> text runs pdfmake understands
function inline(text: string): Run[] {
  const clean = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links -> their text
  const runs: Run[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    if (m.index > last) runs.push({ text: clean.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) {
      runs.push({ text: tok.slice(2, -2), bold: true });
    } else if (tok.startsWith('`')) {
      runs.push({ text: tok.slice(1, -1), italics: true });
    } else {
      runs.push({ text: tok.slice(1, -1), italics: true });
    }
    last = m.index + tok.length;
  }
  if (last < clean.length) runs.push({ text: clean.slice(last) });
  // Roboto (pdfmake's built-in font) has no emoji; drop them.
  return runs
    .map((r) => ({ ...r, text: r.text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '') }))
    .filter((r) => r.text.length > 0);
}

function markdownToContent(markdown: string): Content[] {
  const out: Content[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let para: string[] = [];
  let list: { ordered: boolean; items: Run[][] } | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push({ text: inline(para.join(' ')), style: 'body' });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((runs) => ({ text: runs, style: 'body' }));
      out.push(
        list.ordered
          ? { ol: items, style: 'list' }
          : { ul: items, style: 'list' },
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);

    if (!line.trim() || /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      out.push({
        text: inline(heading[2]),
        style: heading[1].length <= 2 ? 'h2' : 'h3',
      });
    } else if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      const itemText = (bullet ?? numbered)![1];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(inline(itemText));
    } else if (quote) {
      flushPara();
      flushList();
      out.push({ text: inline(quote[1]), style: 'quote' });
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // continuation of the previous list item
      const items: Run[][] = (list as { items: Run[][] }).items;
      items[items.length - 1].push({ text: ' ' }, ...inline(line.trim()));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out;
}

export function reviewerPdfDefinition(title: string, markdown: string): TDocumentDefinitions {
  const date = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [54, 60, 54, 60],
    content: [
      { text: 'REVIEWER', style: 'eyebrow' },
      { text: title, style: 'title' },
      { text: date, style: 'meta' },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 487, y2: 0, lineWidth: 1, lineColor: '#E5E7EB' }],
        margin: [0, 10, 0, 6],
      },
      ...markdownToContent(markdown),
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: title, style: 'footer', margin: [54, 0, 0, 0] },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          style: 'footer',
          alignment: 'right',
          margin: [0, 0, 54, 0],
        },
      ],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3, color: '#1F2937' },
    styles: {
      eyebrow: { fontSize: 8, bold: true, color: '#DC2626', characterSpacing: 1.5 },
      title: { fontSize: 20, bold: true, color: '#111827', margin: [0, 4, 0, 2] },
      meta: { fontSize: 9, color: '#6B7280' },
      h2: { fontSize: 14, bold: true, color: '#111827', margin: [0, 14, 0, 6] },
      h3: { fontSize: 12, bold: true, color: '#111827', margin: [0, 10, 0, 4] },
      body: { margin: [0, 0, 0, 6] },
      list: { margin: [0, 0, 0, 6] },
      quote: { italics: true, color: '#4B5563', margin: [12, 0, 0, 6] },
      footer: { fontSize: 8, color: '#9CA3AF' },
    },
  };
}

/** Builds the PDF in the browser and returns it as a File ready to upload. */
export async function markdownToPdfFile(title: string, markdown: string): Promise<File> {
  // Loaded only when needed, so pdfmake doesn't slow down normal pages.
  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const fontsModule = await import('pdfmake/build/vfs_fonts');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfMake: any = (pdfMakeModule as any).default ?? pdfMakeModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fonts: any = (fontsModule as any).default ?? fontsModule;
  pdfMake.vfs = fonts?.pdfMake?.vfs ?? fonts?.vfs ?? fonts;

  const blob: Blob = await new Promise((resolve) => {
    pdfMake.createPdf(reviewerPdfDefinition(title, markdown)).getBlob(resolve);
  });

  const safeName =
    title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Reviewer';
  return new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
}