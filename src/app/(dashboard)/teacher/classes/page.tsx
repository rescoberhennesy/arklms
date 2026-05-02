import {
  listMyClasses,
  listMyClassNameSuggestions,
  listMySectionSuggestions,
} from '@/lib/actions/classes';
import { ClassesView } from '@/components/teacher/ClassesView';

export const dynamic = 'force-dynamic';

export default async function TeacherClassesPage() {
  const [classesRes, namesRes, sectionsRes] = await Promise.all([
    listMyClasses(),
    listMyClassNameSuggestions(),
    listMySectionSuggestions(),
  ]);

  const initialClasses = classesRes.ok ? classesRes.data : [];
  const nameSuggestions = namesRes.ok ? namesRes.data : [];
  const sectionSuggestions = sectionsRes.ok ? sectionsRes.data : [];

  return (
    <ClassesView
      initialClasses={initialClasses}
      nameSuggestions={nameSuggestions}
      sectionSuggestions={sectionSuggestions}
    />
  );
}
