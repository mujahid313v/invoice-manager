"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";

type InvoiceListItem = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string;
  taxPercent: number;
  discountCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  clientId: string;
  clientName: string;
  createdAt: string;
  updatedAt: string;
};

type InvoiceErrorResponse = {
  error?: string;
};

const statusStyles: Record<string, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  SENT: "border-blue-200 bg-blue-50 text-blue-700",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function SkeletonRows() {
  return (
    <div className="mt-6 space-y-3" role="status" aria-live="polite">
      <span className="sr-only">Loading invoices...</span>
      {[0, 1, 2].map((item) => (
        <div
          className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5"
          key={item}
        >
          <div className="h-4 w-1/4 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-2/5 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function InvoicesManager() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;

    Promise.all([
      fetch("/api/invoices", { cache: "no-store", signal: controller.signal }),
      fetch("/api/business-profile", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([invoicesResponse, profileResponse]) => {
        if (requestId.current !== id) {
          return;
        }

        if (
          invoicesResponse.status === 401 ||
          profileResponse.status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        const invoiceData = (await invoicesResponse.json().catch(() => null)) as
          | InvoiceListItem[]
          | InvoiceErrorResponse
          | null;
        const profileData = (await profileResponse.json().catch(() => null)) as
          | { currency?: string }
          | InvoiceErrorResponse
          | null;

        if (requestId.current !== id) {
          return;
        }

        if (!invoicesResponse.ok) {
          setInvoices([]);
          setError(
            (invoiceData as InvoiceErrorResponse | null)?.error ??
              "Unable to load invoices."
          );
          return;
        }

        if (
          profileResponse.ok &&
          profileData &&
          typeof (profileData as { currency?: string }).currency === "string"
        ) {
          setCurrency((profileData as { currency: string }).currency);
        }

        setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
        setError(null);
      })
      .catch((fetchError) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }

        if (requestId.current === id) {
          setInvoices([]);
          setError("Network error. Check your connection and try again.");
        }
      })
      .finally(() => {
        if (requestId.current === id) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadToken, router]);

  function retryLoad() {
    setError(null);
    setReloadToken((current) => current + 1);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Invoices</h2>
          <p className="mt-1 text-sm text-slate-600">
            Drafts you create appear here. Sending, paying and PDF exports come
            in later phases.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
          href="/invoices/new"
        >
          New invoice
        </Link>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <div
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-4"
          role="alert"
        >
          <p className="break-words text-sm text-red-700">{error}</p>
          <button
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={retryLoad}
          >
            Try again
          </button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            No invoices yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Create your first draft invoice for one of your clients.
          </p>
          <Link
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            href="/invoices/new"
          >
            Create an invoice
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-4 font-semibold">Number</th>
                <th className="py-3 pr-4 font-semibold">Client</th>
                <th className="py-3 pr-4 font-semibold">Total</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 font-semibold">Due date</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  className="border-b border-slate-100 last:border-0"
                  key={invoice.id}
                >
                  <td className="py-3.5 pr-4 font-semibold text-slate-900">
                    {invoice.number}
                  </td>
                  <td className="py-3.5 pr-4 text-slate-700">
                    {invoice.clientName}
                  </td>
                  <td className="py-3.5 pr-4 text-slate-700">
                    {formatMoney(invoice.totalCents, currency)}
                  </td>
                  <td className="py-3.5 pr-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        statusStyles[invoice.status] ?? statusStyles.DRAFT
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td className="py-3.5 text-slate-700">{invoice.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
