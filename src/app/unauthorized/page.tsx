import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-800 mb-4">403</h1>
        <p className="text-xl text-slate-600 mb-6">You don&apos;t have access to this page.</p>
        <Link
          href="/"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}