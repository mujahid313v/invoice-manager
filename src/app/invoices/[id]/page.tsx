import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceDetailContent } from "@/components/invoice-detail-content";
import { AppShell } from "@/components/ui";
import { btnSecondary } from "@/components/ui-styles";
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
    <AppShell
      userEmail={user.email}
      title="Invoice"
      actions={
        <Link className={btnSecondary} href="/invoices">
          Back to invoices
        </Link>
      }
    >
      <Suspense fallback={<InvoiceDetailSkeleton />}>
        <InvoiceDetailContent invoiceId={id} saved={saved} />
      </Suspense>
    </AppShell>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-sweep rounded bg-slate-200 ${className}`} />;
}

function InvoiceDetailSkeleton() {
  return (
    <section className="anim-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Loading invoice...</span>
        <div className="flex items-start justify-between gap-6">
          <div className="w-1/3 space-y-2">
            <SkeletonBlock className="h-5 w-3/4" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
          <div className="w-1/4 space-y-2">
            <SkeletonBlock className="h-5 w-full" />
            <SkeletonBlock className="h-4 w-2/3" />
          </div>
        </div>
        <SkeletonBlock className="h-6 w-2/3" />
        <SkeletonBlock className="h-40 w-full" />
        <div className="ml-auto w-1/3 space-y-2">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-5 w-2/3" />
        </div>
      </div>
    </section>
  );
}
