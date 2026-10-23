import Link from "next/link";

export default function InvoiceNotFound() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-xl font-semibold text-slate-900">Invoice not found</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">
          This invoice does not exist, or it belongs to another account.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href="/invoices"
          >
            Back to invoices
          </Link>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            href="/invoices/new"
          >
            New invoice
          </Link>
        </div>
      </div>
    </main>
  );
}
