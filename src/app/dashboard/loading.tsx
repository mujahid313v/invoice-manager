export default function DashboardLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <div
        className="animate-pulse space-y-4"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading dashboard...</span>
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-8 w-40 rounded bg-slate-200" />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
        </div>
        <div className="h-64 rounded-2xl bg-slate-200" />
        <div className="h-72 rounded-2xl bg-slate-200" />
      </div>
    </main>
  );
}
