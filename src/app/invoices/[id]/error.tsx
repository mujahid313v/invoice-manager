"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function InvoiceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Invoice detail page failed:", error.message);
  }, [error]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <div
        className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm sm:p-8"
        role="alert"
      >
        <h1 className="text-xl font-semibold text-slate-900">
          This invoice could not be loaded
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Something went wrong while loading the invoice. Try again, and if the
          problem persists go back to your invoice list.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            type="button"
            onClick={reset}
          >
            Try again
          </button>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            href="/invoices"
          >
            Back to invoices
          </Link>
        </div>
      </div>
    </main>
  );
}
