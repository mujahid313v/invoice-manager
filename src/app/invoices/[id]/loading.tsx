export default function InvoiceDetailLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <div
        className="animate-pulse space-y-4"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading invoice...</span>
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-8 w-40 rounded bg-slate-200" />
        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="h-5 w-1/3 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-1/2 rounded bg-slate-200" />
          <div className="mt-10 h-32 w-full rounded bg-slate-200" />
        </div>
      </div>
    </main>
  );
}
