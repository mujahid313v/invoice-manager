"use client";

import Link from "next/link";
import { useEffect } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui-styles";

export default function EditInvoiceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Invoice edit page failed:", error.message);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <div
        className="anim-rise rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm sm:p-8"
        role="alert"
      >
        <h1 className="text-xl font-semibold text-slate-900">
          The invoice editor could not be loaded
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Something went wrong while loading the invoice for editing. Try
          again, and if the problem persists go back to your invoice list.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className={btnPrimary} type="button" onClick={reset}>
            Try again
          </button>
          <Link className={btnSecondary} href="/invoices">
            Back to invoices
          </Link>
        </div>
      </div>
    </main>
  );
}
