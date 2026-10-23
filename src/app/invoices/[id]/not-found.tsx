import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/components/ui-styles";

export default function InvoiceNotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <div className="anim-rise rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"
        >
          <svg
            className="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" />
            <path d="M14 3.5V8h4" />
            <path d="m10 12.5 5 5m0-5-5 5" />
          </svg>
        </span>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Invoice not found
        </h1>
        <p className="mx-auto mt-2 max-w-prose text-sm leading-6 text-slate-600">
          This invoice does not exist, or it belongs to another account.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link className={btnPrimary} href="/invoices">
            Back to invoices
          </Link>
          <Link className={btnSecondary} href="/invoices/new">
            New invoice
          </Link>
        </div>
      </div>
    </main>
  );
}
