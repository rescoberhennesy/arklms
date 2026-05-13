// src/app/calendar/[token]/route.ts
//
// Session 13 — iCalendar (.ics) feed for student & teacher calendar
// subscriptions.
//
// Subscribed clients (Google Calendar, Apple Calendar, etc.) cannot send
// our Supabase auth cookies. The token in the URL IS the credential.
//
// Flow:
//   1. Extract token from URL path
//   2. Service-role lookup: find profile.id + role from calendar_token
//   3. Fetch published activities for the user's classes + non-completed
//      personal tasks with due_at, both within a +/- 6-month window
//   4. Emit RFC 5545 iCalendar text
//
// Service-role usage is intentional and scoped: this route is the only
// place in the app that bypasses RLS. Authorization is the token check.
// Tokens are 32 url-safe bytes; if leaked, the user regenerates from the
// calendar page UI and the old URL stops working immediately.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Window: 6 months back, 6 months forward. Wide enough that Google/Apple
// see a useful chunk of events; narrow enough that the response stays
// small. iCal subscribers re-fetch periodically (typical: every few hours)
// so the window slides naturally over time.
const WINDOW_MONTHS = 6;

// Activities show as 30-minute deadline blocks ending exactly at due_at.
// Multi-day blocks crowd the calendar; deadline reminders are what students
// actually want.
const DEADLINE_DURATION_MS = 30 * 60 * 1000;

interface ProfileLookup {
  id: string;
  full_name: string | null;
  role: 'student' | 'teacher' | 'admin';
}

interface ActivityRow {
  id: string;
  class_id: string;
  title: string;
  due_at: string;
  published: boolean;
}

interface ClassRow {
  id: string;
  name: string;
  teacher_id: string;
}

interface EnrollmentRow {
  class_id: string;
}

interface PersonalTaskRow {
  id: string;
  title: string;
  due_at: string;
  notes: string | null;
}

// RFC 5545 escaping: backslash-escape commas, semicolons, backslashes; fold
// long lines at 75 octets per CRLF + space; emit CRLFs not LFs.
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// "Fold" a long content line to RFC 5545's 75-octet limit by inserting
// CRLF + single space at fold points. Implemented in code points, not
// bytes, which is technically wrong for multi-byte UTF-8 but in practice
// Google/Apple are forgiving and event titles rarely flirt with the limit.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(i, i + 75));
  i += 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

// Format a Date as the iCal "UTC" form: 20260513T060944Z.
function formatIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function makeIcsResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

// Emit an empty-but-valid calendar so calendar clients don't error out on
// 4xx/5xx — they handle empty VCALENDAR gracefully. Use this for auth
// failures too, to avoid leaking "token valid vs invalid" via status codes.
function emptyCalendar(): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arkadian LMS//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!token || token.length < 40 || token.length > 64) {
    return makeIcsResponse(emptyCalendar());
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      '[calendar.ics] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    return makeIcsResponse(emptyCalendar());
  }

  const supabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('calendar_token', token)
    .maybeSingle();

  if (profileErr) {
    console.error('[calendar.ics] profile lookup error:', profileErr.message);
    return makeIcsResponse(emptyCalendar());
  }
  if (!profileData) {
    return makeIcsResponse(emptyCalendar());
  }
  const profile = profileData as ProfileLookup;

  let classIds: string[] = [];
  if (profile.role === 'student') {
    const { data: enrollments, error: enrollErr } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', profile.id);
    if (enrollErr) {
      console.error('[calendar.ics] enrollments error:', enrollErr.message);
    } else {
      classIds = (enrollments as EnrollmentRow[]).map((e) => e.class_id);
    }
  } else if (profile.role === 'teacher') {
    const { data: ownedClasses, error: classErr } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', profile.id);
    if (classErr) {
      console.error('[calendar.ics] owned classes error:', classErr.message);
    } else {
      classIds = (ownedClasses as Array<{ id: string }>).map((c) => c.id);
    }
  }

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setMonth(now.getMonth() - WINDOW_MONTHS);
  const windowEnd = new Date(now);
  windowEnd.setMonth(now.getMonth() + WINDOW_MONTHS);
  const windowStartIso = windowStart.toISOString();
  const windowEndIso = windowEnd.toISOString();

  let activities: ActivityRow[] = [];
  if (classIds.length > 0) {
    const { data: actData, error: actErr } = await supabase
      .from('activities')
      .select('id, class_id, title, due_at, published')
      .in('class_id', classIds)
      .eq('published', true)
      .gte('due_at', windowStartIso)
      .lt('due_at', windowEndIso);
    if (actErr) {
      console.error('[calendar.ics] activities error:', actErr.message);
    } else {
      activities = (actData ?? []) as ActivityRow[];
    }
  }

  const activityClassIds = Array.from(new Set(activities.map((a) => a.class_id)));
  const classNameById = new Map<string, string>();
  if (activityClassIds.length > 0) {
    const { data: classRows, error: cnErr } = await supabase
      .from('classes')
      .select('id, name, teacher_id')
      .in('id', activityClassIds);
    if (cnErr) {
      console.error('[calendar.ics] class names error:', cnErr.message);
    } else {
      for (const c of (classRows ?? []) as ClassRow[]) {
        classNameById.set(c.id, c.name);
      }
    }
  }

  const { data: taskData, error: taskErr } = await supabase
    .from('personal_tasks')
    .select('id, title, due_at, notes')
    .eq('owner_id', profile.id)
    .is('completed_at', null)
    .not('due_at', 'is', null)
    .gte('due_at', windowStartIso)
    .lt('due_at', windowEndIso);
  if (taskErr) {
    console.error('[calendar.ics] tasks error:', taskErr.message);
  }
  const personalTasks: PersonalTaskRow[] = (taskData ?? []) as PersonalTaskRow[];

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arkadian LMS//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('Arkadian LMS — ' + (profile.full_name ?? 'Calendar'))}`,
    'X-WR-TIMEZONE:UTC',
  ];

  const dtstamp = formatIcsUtc(now);

  for (const a of activities) {
    const dueAt = new Date(a.due_at);
    const startAt = new Date(dueAt.getTime() - DEADLINE_DURATION_MS);
    const className = classNameById.get(a.class_id) ?? 'Class';
    const summary = `${a.title} — ${className}`;
    const uid = `activity-${a.id}@arkadian-lms`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatIcsUtc(startAt)}`);
    lines.push(`DTEND:${formatIcsUtc(dueAt)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(`Activity due: ${a.title} (${className})`)}`));
    lines.push('END:VEVENT');
  }

  for (const t of personalTasks) {
    const dueAt = new Date(t.due_at);
    const startAt = new Date(dueAt.getTime() - DEADLINE_DURATION_MS);
    const uid = `task-${t.id}@arkadian-lms`;
    const description = t.notes ? t.notes : 'Personal task';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatIcsUtc(startAt)}`);
    lines.push(`DTEND:${formatIcsUtc(dueAt)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(t.title)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(description)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return makeIcsResponse(lines.join('\r\n'));
}