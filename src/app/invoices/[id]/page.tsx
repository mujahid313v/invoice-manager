import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceDetailContent } from "@/components/invoice-detail-content";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth";
import { invoiceExistsForUser } from "@/lib/invoices";

export const dynamic = "force-dynamic";

type InvoiceDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: InvoiceDetailPageProps) {
  const user = await requirePageUser();
  const { id } = await params;
  const { saved } = await searchParams;

  // The ownership check runs here, in the page body and before any
  // Suspense boundary has rendered. A missing invoice, or one owned by
  // somebody else, is answered with a real 404 status and the segment's
  // not-found UI. Calling notFound() from inside the streamed content
  // would keep the 200 status the response already started with.
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
            Invoice
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
            href="/invoices"
          >
            Back to invoices
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="mt-10">
        <Suspense fallback={<InvoiceDetailSkeleton />}>
          <InvoiceDetailContent invoiceId={id} saved={saved} />
        </Suspense>
      </div>
    </main>
  );
}

function InvoiceDetailSkeleton() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="animate-pulse space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Loading invoice...</span>
        <div className="h-5 w-1/3 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="mt-8 h-40 w-full rounded bg-slate-200" />
      </div>
    </section>
  );
}
