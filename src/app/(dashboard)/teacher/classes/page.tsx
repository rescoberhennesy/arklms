import {
  listMyClasses,
  listMyClassNameSuggestions,
  listMySectionSuggestions,
} from '@/lib/actions/classes';
import { getClassAvatars } from '@/lib/actions/classAvatars';
import { ClassesView } from '@/components/teacher/ClassesView';
import type { TeacherClassListItem } from '@/types/class';

export const dynamic = 'force-dynamic';

export default async function TeacherClassesPage() {
  const [classesRes, namesRes, sectionsRes] = await Promise.all([
    listMyClasses(),
    listMyClassNameSuggestions(),
    listMySectionSuggestions(),
  ]);

  const baseClasses = classesRes.ok ? classesRes.data : [];
  const nameSuggestions = namesRes.ok ? namesRes.data : [];
  const sectionSuggestions = sectionsRes.ok ? sectionsRes.data : [];

  // Avatars in parallel — skip archived (their card hides the strip anyway).
  const fetchableClasses = baseClasses.filter((c) => !c.is_archived);
  const avatarResults = await Promise.all(
    fetchableClasses.map((c) => getClassAvatars(c.id)),
  );
  const avatarsByClassId = new Map<string, TeacherClassListItem['avatars']>();
  fetchableClasses.forEach((c, i) => {
    const r = avatarResults[i];
    avatarsByClassId.set(c.id, r.ok ? r.data : []);
  });

  const initialClasses: TeacherClassListItem[] = baseClasses.map((c) => ({
    ...c,
    avatars: c.is_archived ? [] : avatarsByClassId.get(c.id) ?? [],
  }));

  return (
    <ClassesView
      initialClasses={initialClasses}
      nameSuggestions={nameSuggestions}
      sectionSuggestions={sectionSuggestions}
    />
  );
}