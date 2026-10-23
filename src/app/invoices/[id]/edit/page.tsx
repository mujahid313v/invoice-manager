import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceEditContent } from "@/components/invoice-edit-content";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth";
import { invoiceExistsForUser } from "@/lib/invoices";

export const dynamic = "force-dynamic";

type EditInvoicePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const user = await requirePageUser();
  const { id } = await params;

  // The ownership check runs in the page body, before the response starts
  // streaming, so an invoice owned by somebody else is answered with a real
  // 404 status instead of a streamed 200.
  const exists = await invoiceExistsForUser(user.id, id);

  if (!exists) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Invoice Manager
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Edit invoice
          </h1>
          <p className="mt-2 break-words text-sm text-slate-600">
            Signed in as{" "}
            <span className="font-medium break-all text-slate-900">
              {user.email}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3 sm:justify-end">
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href={`/invoices/${id}`}
          >
            Back to invoice
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="mt-10">
        <Suspense fallback={<InvoiceEditSkeleton />}>
          <InvoiceEditContent invoiceId={id} />
        </Suspense>
      </div>
    </main>
  );
}

function InvoiceEditSkeleton() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="animate-pulse space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Loading invoice...</span>
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="h-10 w-2/3 rounded bg-slate-200" />
        <div className="mt-8 h-40 w-full rounded bg-slate-200" />
      </div>
    </section>
  );
}
