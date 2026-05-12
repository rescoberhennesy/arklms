import { listMyClasses } from '@/lib/actions/classes';
import QuickClassPicker from '@/components/teacher/QuickClassPicker';

export const dynamic = 'force-dynamic';

export default async function QuickCreateActivityPage() {
  const result = await listMyClasses();
  const classes = result.ok ? result.data : [];

  return (
    <QuickClassPicker
      title="Create activity"
      description="Choose which class to add an activity to."
      classes={classes}
      hrefPattern="/teacher/classes/{classId}?tab=activities&create=1"
    />
  );
}