import { listMyClasses } from '@/lib/actions/classes';
import QuickClassPicker from '@/components/teacher/QuickClassPicker';

export const dynamic = 'force-dynamic';

export default async function QuickCreateModulePage() {
  const result = await listMyClasses();
  const classes = result.ok ? result.data : [];

  return (
    <QuickClassPicker
      title="Create module"
      description="Choose which class to add a module to."
      classes={classes}
      hrefPattern="/teacher/classes/{classId}?tab=modules&create=1"
    />
  );
}