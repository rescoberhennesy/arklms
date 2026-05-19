import { listAllSections } from '@/lib/actions/admin';
import AdminSectionsView from '@/components/admin/AdminSectionsView';

export const dynamic = 'force-dynamic';

export default async function AdminSectionsPage() {
  let sections;
  try {
    sections = await listAllSections();
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load sections:{' '}
        {err instanceof Error ? err.message : 'Unknown error'}
      </div>
    );
  }
  return <AdminSectionsView sections={sections} />;
}