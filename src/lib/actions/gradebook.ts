'use server';

import * as XLSX from 'xlsx-js-style';
import { createClient } from '@/lib/supabase/server';
import type { ModuleTerm } from '@/lib/types/modules';
import { MODULE_TERMS, MODULE_TERM_LABELS } from '@/lib/types/modules';
import {
  listActivitiesForTeacher,
  listActivitiesForStudent,
  getGradeWeights,
} from '@/lib/actions/activities';
import { listClassRoster } from '@/lib/actions/enrollments';
import type {
  SubmissionWithGrade,
  ClassGradeWeights,
} from '@/lib/types/activities';

// ==========================================================================
// TEACHER GRADEBOOK
// ==========================================================================

export type CellStatus =
  | 'not_due_yet'
  | 'open'
  | 'missing'
  | 'submitted_ungraded'
  | 'graded_unreleased'
  | 'graded_released'
  | 'late_window'
  | 'draft_activity';

export interface GradebookCell {
  activityId: string;
  status: CellStatus;
  score: number | null;
  maxPoints: number;
  isLate: boolean;
  submissionId: string | null;
}

export interface GradebookActivityHeader {
  id: string;
  title: string;
  term: ModuleTerm;
  maxPoints: number;
  published: boolean;
  displayOrder: number;
}

export interface GradebookStudentRow {
  studentId: string;
  fullName: string | null;
  email: string | null;
  cells: Record<string, GradebookCell>;
  termPercents: Record<ModuleTerm, number | null>;
  finalPercent: number | null;
  hasMissing: boolean;
  hasUngraded: boolean;
}

export interface GradebookView {
  classId: string;
  className: string;
  activitiesByTerm: Record<ModuleTerm, GradebookActivityHeader[]>;
  activitiesOrdered: GradebookActivityHeader[];
  students: GradebookStudentRow[];
  weights: ClassGradeWeights | null;
  isWeighted: boolean;
}

function computeCellStatus(
  activity: GradebookActivityHeader,
  startAt: number,
  dueAt: number,
  allowLate: boolean,
  submission: SubmissionWithGrade | undefined,
  now: number,
): CellStatus {
  if (!activity.published) return 'draft_activity';
  if (submission) {
    if (submission.grade) {
      return submission.grade.returnedAt
        ? 'graded_released'
        : 'graded_unreleased';
    }
    return 'submitted_ungraded';
  }
  if (now < startAt) return 'not_due_yet';
  if (now <= dueAt) return 'open';
  if (allowLate) return 'late_window';
  return 'missing';
}

export async function getGradebookView(
  classId: string,
): Promise<GradebookView> {
  const supabase = await createClient();

  const { data: classRow, error: classErr } = await supabase
    .from('classes')
    .select('id, name')
    .eq('id', classId)
    .single();
  if (classErr) throw new Error(classErr.message);
  const className = (classRow as { name: string }).name;

  const [activities, roster, weights] = await Promise.all([
    listActivitiesForTeacher(classId),
    listClassRoster(classId),
    getGradeWeights(classId),
  ]);

  const isWeighted = weights !== null;

  const termOrder = MODULE_TERMS.reduce<Record<ModuleTerm, number>>(
    (acc, term, idx) => {
      acc[term] = idx;
      return acc;
    },
    {} as Record<ModuleTerm, number>,
  );

  const activitiesOrdered: GradebookActivityHeader[] = activities
    .map((a): GradebookActivityHeader => ({
      id: a.id,
      title: a.title,
      term: a.term,
      maxPoints: a.maxPoints,
      published: a.published,
      displayOrder: a.displayOrder,
    }))
    .sort((x: GradebookActivityHeader, y: GradebookActivityHeader) => {
      const t = termOrder[x.term] - termOrder[y.term];
      if (t !== 0) return t;
      return x.displayOrder - y.displayOrder;
    });

  const activitiesByTerm: Record<ModuleTerm, GradebookActivityHeader[]> = {
    prelim: [],
    midterm: [],
    prefinal: [],
    final: [],
  };
  for (const a of activitiesOrdered) activitiesByTerm[a.term].push(a);

  const submissionByKey = new Map<string, SubmissionWithGrade>();
  const activityMetaById = new Map<
    string,
    { startAt: number; dueAt: number; allowLate: boolean }
  >();
  for (const a of activities) {
    activityMetaById.set(a.id, {
      startAt: new Date(a.startAt).getTime(),
      dueAt: new Date(a.dueAt).getTime(),
      allowLate: a.allowLate,
    });
    for (const s of a.submissions) {
      submissionByKey.set(`${a.id}:${s.studentId}`, s);
    }
  }

  const now = Date.now();

  const students: GradebookStudentRow[] = roster.map((r) => {
    const cells: Record<string, GradebookCell> = {};
    let hasMissing = false;
    let hasUngraded = false;

    const termEarned: Record<ModuleTerm, number> = {
      prelim: 0,
      midterm: 0,
      prefinal: 0,
      final: 0,
    };
    const termPossible: Record<ModuleTerm, number> = {
      prelim: 0,
      midterm: 0,
      prefinal: 0,
      final: 0,
    };

    for (const a of activitiesOrdered) {
      const meta = activityMetaById.get(a.id)!;
      const sub = submissionByKey.get(`${a.id}:${r.student_id}`);
      const status = computeCellStatus(
        a,
        meta.startAt,
        meta.dueAt,
        meta.allowLate,
        sub,
        now,
      );

      const score: number | null = sub?.grade ? sub.grade.score : null;
      cells[a.id] = {
        activityId: a.id,
        status,
        score,
        maxPoints: a.maxPoints,
        isLate: !!sub?.isLate,
        submissionId: sub?.id ?? null,
      };

      if (status === 'missing') hasMissing = true;
      if (
        status === 'submitted_ungraded' ||
        status === 'graded_unreleased'
      ) {
        hasUngraded = true;
      }

      if (status === 'graded_released' && score !== null) {
        termEarned[a.term] += score;
        termPossible[a.term] += a.maxPoints;
      }
    }

    const termPercents: Record<ModuleTerm, number | null> = {
      prelim:
        termPossible.prelim > 0
          ? (termEarned.prelim / termPossible.prelim) * 100
          : null,
      midterm:
        termPossible.midterm > 0
          ? (termEarned.midterm / termPossible.midterm) * 100
          : null,
      prefinal:
        termPossible.prefinal > 0
          ? (termEarned.prefinal / termPossible.prefinal) * 100
          : null,
      final:
        termPossible.final > 0
          ? (termEarned.final / termPossible.final) * 100
          : null,
    };

    let finalPercent: number | null;
    const availableTerms: ModuleTerm[] = MODULE_TERMS.filter(
      (t) => termPercents[t] !== null,
    );
    if (availableTerms.length === 0) {
      finalPercent = null;
    } else if (weights) {
      const weightOf: Record<ModuleTerm, number> = {
        prelim: weights.prelimPct,
        midterm: weights.midtermPct,
        prefinal: weights.prefinalPct,
        final: weights.finalPct,
      };
      const totalWeight = availableTerms.reduce(
        (acc: number, t: ModuleTerm) => acc + weightOf[t],
        0,
      );
      if (totalWeight === 0) {
        finalPercent = null;
      } else {
        const weightedSum = availableTerms.reduce(
          (acc: number, t: ModuleTerm) =>
            acc + (termPercents[t] as number) * weightOf[t],
          0,
        );
        finalPercent = weightedSum / totalWeight;
      }
    } else {
      const sum = availableTerms.reduce(
        (acc: number, t: ModuleTerm) => acc + (termPercents[t] as number),
        0,
      );
      finalPercent = sum / availableTerms.length;
    }

    return {
      studentId: r.student_id,
      fullName: r.full_name,
      email: r.email,
      cells,
      termPercents,
      finalPercent,
      hasMissing,
      hasUngraded,
    };
  });

  return {
    classId,
    className,
    activitiesByTerm,
    activitiesOrdered,
    students,
    weights,
    isWeighted,
  };
}

// ==========================================================================
// EXCEL EXPORT
// ==========================================================================

// Style presets - xlsx-js-style honors these on write (community xlsx strips them).
const STYLE_META_LABEL = {
  font: { bold: true, sz: 11, color: { rgb: '374151' } },
  alignment: { vertical: 'center' as const },
};
const STYLE_META_VALUE = {
  font: { sz: 11, color: { rgb: '111827' } },
  alignment: { vertical: 'center' as const },
};
const STYLE_LEGEND = {
  font: { italic: true, sz: 10, color: { rgb: '6B7280' } },
  alignment: { vertical: 'center' as const, wrapText: true },
};
const STYLE_TERM_BAND = {
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'B91C1C' } }, // red-700
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  border: {
    top: { style: 'thin' as const, color: { rgb: '991B1B' } },
    bottom: { style: 'thin' as const, color: { rgb: '991B1B' } },
    left: { style: 'thin' as const, color: { rgb: '991B1B' } },
    right: { style: 'thin' as const, color: { rgb: '991B1B' } },
  },
};
const STYLE_COL_HEADER = {
  font: { bold: true, sz: 10, color: { rgb: '111827' } },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'F3F4F6' } }, // gray-100
  alignment: {
    horizontal: 'center' as const,
    vertical: 'center' as const,
    wrapText: true,
  },
  border: {
    top: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
    bottom: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
    left: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
    right: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
  },
};
const STYLE_IDENTITY_HEADER = {
  font: { bold: true, sz: 10, color: { rgb: '111827' } },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'E5E7EB' } }, // gray-200
  alignment: { horizontal: 'left' as const, vertical: 'center' as const },
};
const STYLE_IDENTITY_CELL = {
  font: { sz: 10, color: { rgb: '111827' } },
  alignment: { vertical: 'center' as const },
};
const STYLE_DATA_CELL = {
  font: { sz: 10 },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const STYLE_DATA_MISSING = {
  font: { sz: 10, bold: true, color: { rgb: '991B1B' } }, // red-800
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'FEE2E2' } }, // red-100
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const STYLE_DATA_SUBMITTED = {
  font: { sz: 10, color: { rgb: '1E40AF' } }, // blue-800
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const STYLE_DATA_SUBMITTED_LATE = {
  font: { sz: 10, color: { rgb: '92400E' } }, // amber-800
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const STYLE_DATA_MUTED = {
  font: { sz: 10, color: { rgb: '9CA3AF' } }, // gray-400
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const STYLE_SUBTOTAL_CELL = {
  font: { sz: 10, bold: true, color: { rgb: '111827' } },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'F9FAFB' } }, // gray-50
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const STYLE_FINAL_CELL = {
  font: { sz: 11, bold: true, color: { rgb: '111827' } },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'FEF3C7' } }, // amber-100
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  border: {
    left: { style: 'medium' as const, color: { rgb: '9CA3AF' } },
  },
};

// Sanitizes a string for use in a filename - underscore separators, no unsafe chars.
function safeFilenamePart(s: string): string {
  return s
    .replace(/[\\/?*\[\]:<>|"]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();
}

// Formats Date → YYYY-MM-DD in local time (filename-friendly).
function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Formats Date → "YYYY-MM-DD HH:mm" for the human-readable metadata block.
function formatDateTimeForMeta(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// Writes a cell value + style at (r, c). Auto-detects number vs string type.
function putCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string | number,
  style?: object,
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell: XLSX.CellObject =
    typeof value === 'number'
      ? { t: 'n', v: value }
      : { t: 's', v: value };
  if (style) (cell as XLSX.CellObject & { s?: object }).s = style;
  ws[addr] = cell;
}

export async function exportGradebookToBase64(classId: string): Promise<{
  base64: string;
  fileName: string;
}> {
  const view = await getGradebookView(classId);

  // Resolve teacher name for metadata block (one extra query - small).
  const supabase = await createClient();
  const { data: classRow } = await supabase
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .single();
  let teacherName = 'Unknown';
  if (classRow) {
    const teacherId = (classRow as { teacher_id: string }).teacher_id;
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', teacherId)
      .single();
    if (prof) {
      const p = prof as { full_name: string | null; email: string };
      teacherName = p.full_name?.trim() || p.email;
    }
  }

  const exportedAt = new Date();

  // ---- Sheet layout planning -------------------------------------------------
  // Row 0: "Class: <name>"
  // Row 1: "Teacher: <name>"
  // Row 2: "Exported: <ts>"
  // Row 3: blank
  // Row 4: legend (single merged cell spanning all data columns)
  // Row 5: blank
  // Row 6: term band row (merged per term, "—" for identity cols + final col)
  // Row 7: per-column headers (Name, Email, activity titles, term %, Final)
  // Row 8+: student data rows
  // ---------------------------------------------------------------------------

  const IDENTITY_COLS = ['Name', 'Email'];

  // Build the column plan first so we know total width.
  type ColPlan =
    | { kind: 'identity'; label: string }
    | {
        kind: 'activity';
        term: ModuleTerm;
        activity: GradebookActivityHeader;
      }
    | { kind: 'term_percent'; term: ModuleTerm }
    | { kind: 'final' };

  const colPlan: ColPlan[] = [];
  for (const label of IDENTITY_COLS) {
    colPlan.push({ kind: 'identity', label });
  }
  for (const term of MODULE_TERMS) {
    const acts = view.activitiesByTerm[term];
    if (acts.length === 0) continue;
    for (const a of acts) {
      colPlan.push({ kind: 'activity', term, activity: a });
    }
    colPlan.push({ kind: 'term_percent', term });
  }
  colPlan.push({ kind: 'final' });

  const totalCols = colPlan.length;
  const lastCol = totalCols - 1;

  const ROW_CLASS = 0;
  const ROW_TEACHER = 1;
  const ROW_EXPORTED = 2;
  const ROW_LEGEND = 4;
  const ROW_TERM_BAND = 6;
  const ROW_COL_HEADERS = 7;
  const ROW_DATA_START = 8;

  // Build empty worksheet, then write cells one at a time so we can attach styles.
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];

  // Metadata rows
  putCell(ws, ROW_CLASS, 0, 'Class:', STYLE_META_LABEL);
  putCell(ws, ROW_CLASS, 1, view.className, STYLE_META_VALUE);
  merges.push({ s: { r: ROW_CLASS, c: 1 }, e: { r: ROW_CLASS, c: lastCol } });

  putCell(ws, ROW_TEACHER, 0, 'Teacher:', STYLE_META_LABEL);
  putCell(ws, ROW_TEACHER, 1, teacherName, STYLE_META_VALUE);
  merges.push({
    s: { r: ROW_TEACHER, c: 1 },
    e: { r: ROW_TEACHER, c: lastCol },
  });

  putCell(ws, ROW_EXPORTED, 0, 'Exported:', STYLE_META_LABEL);
  putCell(ws, ROW_EXPORTED, 1, formatDateTimeForMeta(exportedAt), STYLE_META_VALUE);
  merges.push({
    s: { r: ROW_EXPORTED, c: 1 },
    e: { r: ROW_EXPORTED, c: lastCol },
  });

  // Legend row (merged across all columns)
  const legendText =
    'Legend:  MISSING (red fill) = no submission past due date  •  ' +
    '— = submitted, grade not yet released  •  ' +
    'Submitted / Submitted (late) = awaiting grading  •  ' +
    'Numeric values are released scores  •  ' +
    'Term % and Final % computed from released grades only';
  putCell(ws, ROW_LEGEND, 0, legendText, STYLE_LEGEND);
  merges.push({
    s: { r: ROW_LEGEND, c: 0 },
    e: { r: ROW_LEGEND, c: lastCol },
  });

  // Term band row (row 6): merge per-term across that term's columns.
  // Identity columns and the Final column get blank placeholders so the row exists.
  for (let c = 0; c < totalCols; c++) {
    putCell(ws, ROW_TERM_BAND, c, '', STYLE_COL_HEADER);
  }
  // Walk colPlan, find each term's start/end columns
  let termStart = -1;
  let currentTerm: ModuleTerm | null = null;
  for (let c = 0; c < colPlan.length; c++) {
    const p = colPlan[c];
    if (p.kind === 'activity' || p.kind === 'term_percent') {
      if (currentTerm !== p.term) {
        if (currentTerm !== null && termStart >= 0) {
          // close previous term band
          putCell(
            ws,
            ROW_TERM_BAND,
            termStart,
            MODULE_TERM_LABELS[currentTerm],
            STYLE_TERM_BAND,
          );
          if (c - 1 > termStart) {
            merges.push({
              s: { r: ROW_TERM_BAND, c: termStart },
              e: { r: ROW_TERM_BAND, c: c - 1 },
            });
          }
        }
        currentTerm = p.term;
        termStart = c;
      }
    } else if (currentTerm !== null && termStart >= 0) {
      // closing a term band because we hit a non-term column
      putCell(
        ws,
        ROW_TERM_BAND,
        termStart,
        MODULE_TERM_LABELS[currentTerm],
        STYLE_TERM_BAND,
      );
      if (c - 1 > termStart) {
        merges.push({
          s: { r: ROW_TERM_BAND, c: termStart },
          e: { r: ROW_TERM_BAND, c: c - 1 },
        });
      }
      currentTerm = null;
      termStart = -1;
    }
  }
  // Close trailing term band if the loop ended mid-term (shouldn't happen since
  // Final column is always last, but defensive).
  if (currentTerm !== null && termStart >= 0) {
    putCell(
      ws,
      ROW_TERM_BAND,
      termStart,
      MODULE_TERM_LABELS[currentTerm],
      STYLE_TERM_BAND,
    );
    if (colPlan.length - 1 > termStart) {
      merges.push({
        s: { r: ROW_TERM_BAND, c: termStart },
        e: { r: ROW_TERM_BAND, c: colPlan.length - 1 },
      });
    }
  }

  // Column-header row (row 7)
  for (let c = 0; c < colPlan.length; c++) {
    const p = colPlan[c];
    if (p.kind === 'identity') {
      putCell(ws, ROW_COL_HEADERS, c, p.label, STYLE_IDENTITY_HEADER);
    } else if (p.kind === 'activity') {
      const a = p.activity;
      const draftSuffix = a.published ? '' : ' (draft)';
      putCell(
        ws,
        ROW_COL_HEADERS,
        c,
        `${a.title}${draftSuffix}\n/ ${a.maxPoints}`,
        STYLE_COL_HEADER,
      );
    } else if (p.kind === 'term_percent') {
      putCell(
        ws,
        ROW_COL_HEADERS,
        c,
        `${MODULE_TERM_LABELS[p.term]} %`,
        STYLE_COL_HEADER,
      );
    } else {
      const finalLabel = view.isWeighted
        ? 'Final (weighted) %'
        : 'Final (unweighted) %';
      putCell(ws, ROW_COL_HEADERS, c, finalLabel, STYLE_COL_HEADER);
    }
  }

  // Data rows
  for (let i = 0; i < view.students.length; i++) {
    const s = view.students[i];
    const r = ROW_DATA_START + i;
    for (let c = 0; c < colPlan.length; c++) {
      const p = colPlan[c];
      if (p.kind === 'identity') {
        const v = p.label === 'Name' ? (s.fullName ?? '') : (s.email ?? '');
        putCell(ws, r, c, v, STYLE_IDENTITY_CELL);
      } else if (p.kind === 'activity') {
        const cell = s.cells[p.activity.id];
        if (cell.status === 'graded_released' && cell.score !== null) {
          putCell(ws, r, c, cell.score, STYLE_DATA_CELL);
        } else if (cell.status === 'graded_unreleased') {
          putCell(ws, r, c, '—', STYLE_DATA_MUTED);
        } else if (cell.status === 'submitted_ungraded') {
          putCell(
            ws,
            r,
            c,
            cell.isLate ? 'Submitted (late)' : 'Submitted',
            cell.isLate ? STYLE_DATA_SUBMITTED_LATE : STYLE_DATA_SUBMITTED,
          );
        } else if (cell.status === 'missing') {
          putCell(ws, r, c, 'MISSING', STYLE_DATA_MISSING);
        } else {
          // not_due_yet | open | late_window | draft_activity
          putCell(ws, r, c, '—', STYLE_DATA_MUTED);
        }
      } else if (p.kind === 'term_percent') {
        const pct = s.termPercents[p.term];
        if (pct === null) {
          putCell(ws, r, c, '—', STYLE_SUBTOTAL_CELL);
        } else {
          putCell(ws, r, c, Number(pct.toFixed(2)), STYLE_SUBTOTAL_CELL);
        }
      } else {
        if (s.finalPercent === null) {
          putCell(ws, r, c, '—', STYLE_FINAL_CELL);
        } else {
          putCell(
            ws,
            r,
            c,
            Number(s.finalPercent.toFixed(2)),
            STYLE_FINAL_CELL,
          );
        }
      }
    }
  }

  // ---- Worksheet bookkeeping -------------------------------------------------

  // Worksheet range must cover everything we wrote.
  const lastDataRow = view.students.length === 0
    ? ROW_COL_HEADERS
    : ROW_DATA_START + view.students.length - 1;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastDataRow, c: lastCol },
  });

  if (merges.length) ws['!merges'] = merges;

  // Column widths
  const colWidths: XLSX.ColInfo[] = colPlan.map((p) => {
    if (p.kind === 'identity') {
      return { wch: p.label === 'Name' ? 26 : 30 };
    }
    if (p.kind === 'activity') return { wch: 18 };
    if (p.kind === 'term_percent') return { wch: 14 };
    return { wch: 20 }; // final
  });
  ws['!cols'] = colWidths;

  // Row heights for the header rows
  ws['!rows'] = [];
  ws['!rows'][ROW_LEGEND] = { hpt: 32 };
  ws['!rows'][ROW_TERM_BAND] = { hpt: 22 };
  ws['!rows'][ROW_COL_HEADERS] = { hpt: 34 };

  // Freeze: keep identity columns and everything through column-header row visible.
  ws['!freeze'] = { xSplit: IDENTITY_COLS.length, ySplit: ROW_DATA_START };

  // ---- Workbook + write ------------------------------------------------------

  const wb = XLSX.utils.book_new();
  const safeSheetName =
    view.className.replace(/[\\/?*\[\]:]/g, '').slice(0, 31).trim() ||
    'Gradebook';
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  const buf: ArrayBuffer = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
    cellStyles: true,
  });

  const base64 = Buffer.from(buf).toString('base64');

  const fileName = `${safeFilenamePart(view.className)}_grades_${formatDateYMD(exportedAt)}.xlsx`;

  return { base64, fileName };
}

// ==========================================================================
// STUDENT GRADEBOOK
// ==========================================================================

export type StudentCellStatus =
  | 'open'
  | 'late_window'
  | 'missing'
  | 'submitted_pending'
  | 'graded';

export interface StudentGradebookCell {
  activityId: string;
  title: string;
  term: ModuleTerm;
  maxPoints: number;
  dueAt: string;
  status: StudentCellStatus;
  isLate: boolean;
  score: number | null;
  feedback: string | null;
  returnedAt: string | null;
}

export interface StudentGradebookView {
  classId: string;
  className: string;
  termCells: Record<ModuleTerm, StudentGradebookCell[]>;
  termPercents: Record<ModuleTerm, number | null>;
  finalPercent: number | null;
  isWeighted: boolean;
  weights: ClassGradeWeights | null;
}

export async function getStudentGradebookView(
  classId: string,
): Promise<StudentGradebookView> {
  const supabase = await createClient();

  const { data: classRow, error: classErr } = await supabase
    .from('classes')
    .select('id, name')
    .eq('id', classId)
    .single();
  if (classErr) throw new Error(classErr.message);
  const className = (classRow as { name: string }).name;

  const activities = await listActivitiesForStudent(classId);

  // getGradeWeights is read-only; null → unweighted fallback. Students
  // have SELECT on class_grade_weights via RLS, so no try/catch needed.
  const weights = await getGradeWeights(classId);
  const isWeighted = weights !== null;

  const now = Date.now();

  const termCells: Record<ModuleTerm, StudentGradebookCell[]> = {
    prelim: [],
    midterm: [],
    prefinal: [],
    final: [],
  };

  const termEarned: Record<ModuleTerm, number> = {
    prelim: 0,
    midterm: 0,
    prefinal: 0,
    final: 0,
  };
  const termPossible: Record<ModuleTerm, number> = {
    prelim: 0,
    midterm: 0,
    prefinal: 0,
    final: 0,
  };

  for (const a of activities) {
    const dueAtMs = new Date(a.dueAt).getTime();
    const grade = a.grade;
    const sub = a.submission;

    let status: StudentCellStatus;
    let score: number | null = null;
    let feedback: string | null = null;
    let returnedAt: string | null = null;

    if (grade && grade.returnedAt) {
      status = 'graded';
      score = grade.score;
      feedback = grade.feedback || null;
      returnedAt = grade.returnedAt;
      termEarned[a.term] += grade.score;
      termPossible[a.term] += a.maxPoints;
    } else if (sub) {
      status = 'submitted_pending';
    } else if (now <= dueAtMs) {
      status = 'open';
    } else if (a.allowLate) {
      status = 'late_window';
    } else {
      status = 'missing';
    }

    termCells[a.term].push({
      activityId: a.id,
      title: a.title,
      term: a.term,
      maxPoints: a.maxPoints,
      dueAt: a.dueAt,
      status,
      isLate: !!sub?.isLate,
      score,
      feedback,
      returnedAt,
    });
  }

  const termPercents: Record<ModuleTerm, number | null> = {
    prelim:
      termPossible.prelim > 0
        ? (termEarned.prelim / termPossible.prelim) * 100
        : null,
    midterm:
      termPossible.midterm > 0
        ? (termEarned.midterm / termPossible.midterm) * 100
        : null,
    prefinal:
      termPossible.prefinal > 0
        ? (termEarned.prefinal / termPossible.prefinal) * 100
        : null,
    final:
      termPossible.final > 0
        ? (termEarned.final / termPossible.final) * 100
        : null,
  };

  let finalPercent: number | null;
  const availableTerms: ModuleTerm[] = MODULE_TERMS.filter(
    (t) => termPercents[t] !== null,
  );
  if (availableTerms.length === 0) {
    finalPercent = null;
  } else if (weights) {
    const weightOf: Record<ModuleTerm, number> = {
      prelim: weights.prelimPct,
      midterm: weights.midtermPct,
      prefinal: weights.prefinalPct,
      final: weights.finalPct,
    };
    const totalWeight = availableTerms.reduce(
      (acc: number, t: ModuleTerm) => acc + weightOf[t],
      0,
    );
    if (totalWeight === 0) {
      finalPercent = null;
    } else {
      const weightedSum = availableTerms.reduce(
        (acc: number, t: ModuleTerm) =>
          acc + (termPercents[t] as number) * weightOf[t],
        0,
      );
      finalPercent = weightedSum / totalWeight;
    }
  } else {
    const sum = availableTerms.reduce(
      (acc: number, t: ModuleTerm) => acc + (termPercents[t] as number),
      0,
    );
    finalPercent = sum / availableTerms.length;
  }

  return {
    classId,
    className,
    termCells,
    termPercents,
    finalPercent,
    isWeighted,
    weights,
  };
}