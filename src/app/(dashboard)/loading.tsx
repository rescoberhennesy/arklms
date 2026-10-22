// src/app/(dashboard)/loading.tsx
// Shown instantly while any dashboard page loads.

function Bar({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header */}
      <div className="space-y-3">
        <Bar className="h-3 w-28" />
        <Bar className="h-8 w-72" />
        <Bar className="h-4 w-96 max-w-full" />
      </div>

      {/* Stat row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <Bar className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Bar className="h-3 w-24" />
              <Bar className="h-6 w-12" />
            </div>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
            <Bar className="h-4 w-3/4" />
            <Bar className="h-3 w-1/2" />
            <div className="flex gap-2 pt-1">
              <Bar className="h-5 w-14 rounded-full" />
              <Bar className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}