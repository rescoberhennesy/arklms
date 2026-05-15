// src/lib/ai/quizExport.ts
//
// Builds PDF buffers for quiz export (student copy + teacher copy with answer key).
// Server-only — pdfkit runs in Node, not browser.
//
// Font handling: Next.js bundler can't trace pdfkit's runtime fs.readFileSync
// font lookups in dev mode. We work around it by reading the .afm metric
// files ourselves via require.resolve('pdfkit') (a real module import the
// bundler DOES trace), then registering each font on the PDFDocument as a
// named buffer. Replaces the built-in 'Helvetica' / 'Helvetica-Bold' /
// 'Helvetica-Oblique' string references.
//
// Called by src/app/api/ai/quiz/export/route.ts

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import {
  QuizQuestion,
  McSingleConfig,
  McMultiConfig,
  TrueFalseConfig,
  ShortAnswerConfig,
} from '@/lib/types/quizzes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PdfVariant = 'student' | 'teacher';

export interface QuizExportInput {
  activityTitle: string;
  className: string;
  totalPoints: number;
  questions: QuizQuestion[];
  variant: PdfVariant;
}

// ---------------------------------------------------------------------------
// Font loader — read .afm files from pdfkit's own data dir, then register
// them on the doc as named buffers. The font NAMES used elsewhere in this
// file must match the keys passed to registerFont() below.
// ---------------------------------------------------------------------------

const FONT_REGULAR  = 'AppHelvetica';
const FONT_BOLD     = 'AppHelvetica-Bold';
const FONT_OBLIQUE  = 'AppHelvetica-Oblique';

let cachedFontBuffers: {
  regular: Buffer;
  bold: Buffer;
  oblique: Buffer;
} | null = null;

// Resolve the pdfkit data dir from process.cwd() so we get a real OS path,
// not a bundler-rewritten virtual path like '[project]/...' or '/ROOT/...'.
// Globs the pnpm-mangled folder name so it survives a pdfkit version bump.
function findPdfkitDataDir(): string {
  const pnpmRoot = path.join(process.cwd(), 'node_modules', '.pnpm');
  const entries = fs.readdirSync(pnpmRoot);
  const pdfkitDir = entries.find((e) => e.startsWith('pdfkit@'));
  if (!pdfkitDir) {
    throw new Error('Could not locate pdfkit in node_modules/.pnpm');
  }
  return path.join(pnpmRoot, pdfkitDir, 'node_modules', 'pdfkit', 'js', 'data');
}

function loadFontBuffers() {
  if (cachedFontBuffers) return cachedFontBuffers;

  const dataDir = findPdfkitDataDir();

  cachedFontBuffers = {
    regular: fs.readFileSync(path.join(dataDir, 'Helvetica.afm')),
    bold:    fs.readFileSync(path.join(dataDir, 'Helvetica-Bold.afm')),
    oblique: fs.readFileSync(path.join(dataDir, 'Helvetica-Oblique.afm')),
  };
  return cachedFontBuffers;
}
// ---------------------------------------------------------------------------
// Markdown stripper
// ---------------------------------------------------------------------------

export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

export async function buildQuizPdf(input: QuizExportInput): Promise<Buffer> {
  const { activityTitle, className, totalPoints, questions, variant } = input;
  const isTeacher = variant === 'teacher';

  const fonts = loadFontBuffers();

 return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 60, bottom: 60, left: 72, right: 72 },
      autoFirstPage: true,
      bufferPages: true,
      font: false as unknown as string,  // skip pdfkit's default Helvetica load
    });

    // Register fonts BEFORE any text is written.
    doc.registerFont(FONT_REGULAR, fonts.regular);
    doc.registerFont(FONT_BOLD,    fonts.bold);
    doc.registerFont(FONT_OBLIQUE, fonts.oblique);

    // Set initial font now that registered fonts exist.
    doc.font(FONT_REGULAR);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ------------------------------------------------------------------
    // Colours
    // ------------------------------------------------------------------
    const COLOR_BLACK   = '#111111';
    const COLOR_GRAY    = '#555555';
    const COLOR_CORRECT = '#1a7a3c';
    const COLOR_BANNER  = '#b30000';

    const MARGIN_LEFT  = 72;
    const PAGE_WIDTH   = doc.page.width - MARGIN_LEFT - 72;

    // ------------------------------------------------------------------
    // Header
    // ------------------------------------------------------------------
    doc.font(FONT_REGULAR).fontSize(9).fillColor(COLOR_GRAY)
      .text(className, MARGIN_LEFT, 60);
    doc.moveDown(0.3);

    doc.font(FONT_BOLD).fontSize(16).fillColor(COLOR_BLACK)
      .text(activityTitle, MARGIN_LEFT);
    doc.moveDown(0.3);

    doc.font(FONT_REGULAR).fontSize(10).fillColor(COLOR_GRAY)
      .text(`Total points: ${totalPoints}`, MARGIN_LEFT);
    doc.moveDown(0.5);

    if (isTeacher) {
      const bannerY = doc.y;
      doc.rect(MARGIN_LEFT, bannerY, PAGE_WIDTH, 20).fill(COLOR_BANNER);
      doc.font(FONT_BOLD).fontSize(9).fillColor('#ffffff')
        .text('TEACHER COPY — DO NOT DISTRIBUTE TO STUDENTS', MARGIN_LEFT + 6, bannerY + 5);
      doc.moveDown(1.2);
    } else {
      doc.font(FONT_REGULAR).fontSize(10).fillColor(COLOR_BLACK)
        .text('Name: ________________________________________________    Date: _______________', MARGIN_LEFT);
      doc.moveDown(0.8);
    }

    doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + PAGE_WIDTH, doc.y)
      .strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.moveDown(0.8);

    // ------------------------------------------------------------------
    // Questions
    // ------------------------------------------------------------------
    questions.forEach((q, idx) => {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }

      const promptText = stripMarkdown(q.prompt || `Question ${idx + 1}`);
      const pointsLabel = `(${q.points} ${q.points === 1 ? 'pt' : 'pts'})`;

      doc.font(FONT_BOLD).fontSize(10).fillColor(COLOR_BLACK)
        .text(`${idx + 1}.  ${pointsLabel}`, MARGIN_LEFT, doc.y);

      doc.font(FONT_REGULAR).fontSize(11).fillColor(COLOR_BLACK)
        .text(promptText, MARGIN_LEFT + 16, doc.y, { width: PAGE_WIDTH - 16 });
      doc.moveDown(0.5);

      switch (q.questionKind) {
        case 'mc_single':
        case 'mc_multi': {
          const cfg = q.config as McSingleConfig | McMultiConfig;
          const correctSet = new Set(cfg.correct as number[]);

          cfg.options.forEach((opt, oi) => {
            const letter  = optionLetter(oi);
            const isRight = isTeacher && correctSet.has(oi);

            if (isRight) {
              const cx = MARGIN_LEFT + 32;
              const cy = doc.y + 6;
              doc.circle(cx, cy, 8).strokeColor(COLOR_CORRECT).lineWidth(1.5).stroke();
              doc.font(FONT_BOLD).fontSize(10).fillColor(COLOR_CORRECT)
                .text(`${letter}.  ${stripMarkdown(opt)}`, MARGIN_LEFT + 44, doc.y, {
                  width: PAGE_WIDTH - 44,
                });
            } else {
              doc.font(FONT_REGULAR).fontSize(10).fillColor(COLOR_BLACK)
                .text(`${letter}.  ${stripMarkdown(opt)}`, MARGIN_LEFT + 44, doc.y, {
                  width: PAGE_WIDTH - 44,
                });
            }
            doc.moveDown(0.35);
          });

          if (isTeacher && q.questionKind === 'mc_multi') {
            doc.font(FONT_OBLIQUE).fontSize(8).fillColor(COLOR_CORRECT)
              .text('(Select all circled answers)', MARGIN_LEFT + 44, doc.y);
            doc.moveDown(0.3);
          }
          break;
        }

        case 'true_false': {
          const cfg = q.config as TrueFalseConfig;
          const trueLabel  = 'True';
          const falseLabel = 'False';

          if (isTeacher) {
            const highlightTrue  = cfg.correct === true;
            const highlightFalse = cfg.correct === false;

            doc.fontSize(10)
              .fillColor(highlightTrue ? COLOR_CORRECT : COLOR_BLACK)
              .font(highlightTrue ? FONT_BOLD : FONT_REGULAR)
              .text(trueLabel, MARGIN_LEFT + 44, doc.y, { continued: true });
            doc.fillColor(COLOR_BLACK).font(FONT_REGULAR).text('    /    ', { continued: true });
            doc.fillColor(highlightFalse ? COLOR_CORRECT : COLOR_BLACK)
              .font(highlightFalse ? FONT_BOLD : FONT_REGULAR)
              .text(falseLabel);
          } else {
            doc.font(FONT_REGULAR).fontSize(10).fillColor(COLOR_BLACK)
              .text(`${trueLabel}    /    ${falseLabel}`, MARGIN_LEFT + 44, doc.y);
          }
          doc.moveDown(0.5);
          break;
        }

        case 'short_answer': {
          const cfg = q.config as ShortAnswerConfig;

          doc.font(FONT_REGULAR).fontSize(10).fillColor(COLOR_GRAY)
            .text('Answer:', MARGIN_LEFT + 16, doc.y);
          doc.moveDown(0.2);
          doc.moveTo(MARGIN_LEFT + 16, doc.y)
            .lineTo(MARGIN_LEFT + PAGE_WIDTH, doc.y)
            .strokeColor('#aaaaaa').lineWidth(0.5).stroke();
          doc.moveDown(0.7);
          doc.moveTo(MARGIN_LEFT + 16, doc.y)
            .lineTo(MARGIN_LEFT + PAGE_WIDTH, doc.y)
            .strokeColor('#aaaaaa').lineWidth(0.5).stroke();
          doc.moveDown(0.4);

          if (isTeacher) {
            const caseNote = cfg.case_sensitive ? ' (case-sensitive)' : ' (any case)';
            doc.font(FONT_BOLD).fontSize(8).fillColor(COLOR_CORRECT)
              .text(`Acceptable answers${caseNote}:`, MARGIN_LEFT + 16, doc.y);
            doc.moveDown(0.2);
            doc.font(FONT_REGULAR).fontSize(9).fillColor(COLOR_CORRECT)
              .text(cfg.acceptable.join(' | '), MARGIN_LEFT + 24, doc.y, {
                width: PAGE_WIDTH - 24,
              });
            doc.moveDown(0.3);
          }
          break;
        }

        default:
          doc.font(FONT_OBLIQUE).fontSize(10).fillColor(COLOR_GRAY)
            .text('[See instructions for this question type]', MARGIN_LEFT + 16, doc.y);
          doc.moveDown(0.5);
          break;
      }

      doc.moveDown(0.8);
      doc.moveTo(MARGIN_LEFT, doc.y)
        .lineTo(MARGIN_LEFT + PAGE_WIDTH, doc.y)
        .strokeColor('#eeeeee').lineWidth(0.3).stroke();
      doc.moveDown(0.6);
    });

    // ------------------------------------------------------------------
    // Page numbers
    // ------------------------------------------------------------------
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.font(FONT_REGULAR).fontSize(8).fillColor(COLOR_GRAY)
        .text(
          `Page ${i + 1} of ${totalPages}`,
          MARGIN_LEFT,
          doc.page.height - 40,
          { align: 'center', width: PAGE_WIDTH },
        );
    }

    doc.end();
  });
}