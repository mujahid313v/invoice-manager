export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <div className="space-y-6" role="status" aria-live="polite">
        <span className="sr-only">Loading dashboard...</span>
        <div className="skeleton-sweep h-8 w-40 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div className="skeleton-sweep h-28 rounded-2xl bg-slate-200" key={item} />
          ))}
        </div>
        <div className="skeleton-sweep h-64 rounded-2xl bg-slate-200" />
        <div className="skeleton-sweep h-72 rounded-2xl bg-slate-200" />
      </div>
    </main>
  );
}
