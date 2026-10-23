export default function EditInvoiceLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <div className="space-y-6" role="status" aria-live="polite">
        <span className="sr-only">Loading invoice editor...</span>
        <div className="skeleton-sweep h-4 w-1/3 rounded bg-slate-200" />
        <div className="skeleton-sweep h-8 w-1/2 rounded bg-slate-200" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-4">
            <div className="skeleton-sweep h-10 w-2/3 rounded bg-slate-200" />
            <div className="skeleton-sweep h-24 w-full rounded bg-slate-200" />
            <div className="skeleton-sweep h-10 w-1/2 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </main>
  );
}
