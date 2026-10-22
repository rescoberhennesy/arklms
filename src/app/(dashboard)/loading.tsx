// src/app/(dashboard)/loading.tsx
// Shown while any dashboard page loads. The role folders re-export this.

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="loading-fade flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          {/* track */}
          <span className="absolute inset-0 rounded-full border-[3px] border-zinc-200" />
          {/* spinning arc */}
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-red-600" />
          {/* crest */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Ark Logo.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 m-auto h-9 w-9 object-contain"
          />
        </div>
        <p className="text-[13px] font-semibold tracking-wide text-zinc-500">Loading…</p>
      </div>
    </div>
  )
}