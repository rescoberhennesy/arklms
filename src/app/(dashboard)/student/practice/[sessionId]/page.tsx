// src/app/(dashboard)/student/practice/[sessionId]/page.tsx
import { notFound } from 'next/navigation';
import { getPracticeSession } from '@/lib/actions/practice';
import PracticeSessionDetailView from '@/components/student/PracticeSessionDetailView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PracticeSessionPage({ params }: PageProps) {
  const { sessionId } = await params;
  const detail = await getPracticeSession(sessionId);
  if (!detail) notFound();

  return <PracticeSessionDetailView detail={detail} />;
}