'use server';

import * as XLSX from 'xlsx';
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
  const activityMetaById = new Map <
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

export async function exportGradebookToBase64(classId: string): Promise<{
  base64: string;
  fileName: string;
}> {
  const view = await getGradebookView(classId);

  const identityCols = ['Name', 'Email'];

  const headerRow1: string[] = [...identityCols.map(() => '')];
  const headerRow2: string[] = [...identityCols];

  const merges: XLSX.Range[] = [];

  let colCursor = identityCols.length;

  for (const term of MODULE_TERMS) {
    const acts = view.activitiesByTerm[term];
    if (acts.length === 0) continue;

    const termStartCol = colCursor;
    for (const a of acts) {
      headerRow1.push('');
      const draftSuffix = a.published ? '' : ' (draft)';
      headerRow2.push(`${a.title}${draftSuffix} (/${a.maxPoints})`);
      colCursor++;
    }
    headerRow1.push('');
    headerRow2.push(`${MODULE_TERM_LABELS[term]} %`);
    colCursor++;

    const termEndCol = colCursor - 1;
    headerRow1[termStartCol] = MODULE_TERM_LABELS[term];
    if (termEndCol > termStartCol) {
      merges.push({
        s: { r: 0, c: termStartCol },
        e: { r: 0, c: termEndCol },
      });
    }
  }

  const finalLabel = view.isWeighted
    ? 'Final (weighted)'
    : 'Final (unweighted)';
  headerRow1.push('');
  headerRow2.push(finalLabel);

  const dataRows: (string | number)[][] = view.students.map((s) => {
    const row: (string | number)[] = [s.fullName ?? '', s.email ?? ''];

    for (const term of MODULE_TERMS) {
      const acts = view.activitiesByTerm[term];
      if (acts.length === 0) continue;
      for (const a of acts) {
        const cell = s.cells[a.id];
        if (cell.status === 'graded_released' && cell.score !== null) {
          row.push(cell.score);
        } else if (cell.status === 'graded_unreleased') {
          row.push('Draft');
        } else if (cell.status === 'submitted_ungraded') {
          row.push(cell.isLate ? 'Submitted (late)' : 'Submitted');
        } else if (cell.status === 'missing') {
          row.push('Missing');
        } else if (cell.status === 'late_window') {
          row.push('—');
        } else if (cell.status === 'draft_activity') {
          row.push('—');
        } else {
          row.push('—');
        }
      }
      const pct = s.termPercents[term];
      row.push(pct === null ? '—' : Number(pct.toFixed(2)));
    }

    row.push(
      s.finalPercent === null ? '—' : Number(s.finalPercent.toFixed(2)),
    );
    return row;
  });

  const sheetData = [headerRow1, headerRow2, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  if (merges.length) ws['!merges'] = merges;

  const colWidths: XLSX.ColInfo[] = [{ wch: 24 }, { wch: 28 }];
  for (let i = identityCols.length; i < headerRow2.length; i++) {
    colWidths.push({ wch: 18 });
  }
  ws['!cols'] = colWidths;

  ws['!freeze'] = { xSplit: identityCols.length, ySplit: 2 };

  const wb = XLSX.utils.book_new();
  const safeName =
    view.className.replace(/[\\/?*\[\]:]/g, '').slice(0, 31).trim() ||
    'Gradebook';
  XLSX.utils.book_append_sheet(wb, ws, safeName);

  const buf: ArrayBuffer = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
  });

  const base64 = Buffer.from(buf).toString('base64');

  const fileName = `${view.className.replace(/[\\/?*\[\]:<>|"]/g, '_')} — Gradebook.xlsx`;

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