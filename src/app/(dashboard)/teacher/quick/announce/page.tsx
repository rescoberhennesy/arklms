import { listMyClasses } from '@/lib/actions/classes';
import QuickClassPicker from '@/components/teacher/QuickClassPicker';

export const dynamic = 'force-dynamic';

export default async function QuickAnnouncePage() {
  const result = await listMyClasses();
  const classes = result.ok ? result.data : [];

  return (
    <QuickClassPicker
      title="Post announcement"
      description="Choose which class to announce to."
      classes={classes}
      hrefPattern="/teacher/classes/{classId}?tab=stream"
    />
  );
}