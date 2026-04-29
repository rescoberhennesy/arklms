import { createClient } from '@/lib/supabase/server'

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const { count: teacherCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'teacher')

  const { count: studentCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'student')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Registered Teachers" value={teacherCount ?? 0} />
        <StatCard label="Registered Students" value={studentCount ?? 0} />
        <StatCard label="Active Sections" value={0} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="text-white text-4xl font-bold">{value}</p>
    </div>
  )
}