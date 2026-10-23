import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceEditContent } from "@/components/invoice-edit-content";
import { AppShell } from "@/components/ui";
import { btnSecondary } from "@/components/ui-styles";
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
    <AppShell
      userEmail={user.email}
      title="Edit invoice"
      actions={
        <Link className={btnSecondary} href={`/invoices/${id}`}>
          Back to invoice
        </Link>
      }
    >
      <Suspense fallback={<InvoiceEditSkeleton />}>
        <InvoiceEditContent invoiceId={id} />
      </Suspense>
    </AppShell>
  );
}

function InvoiceEditSkeleton() {
  return (
    <section className="anim-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Loading invoice...</span>
        <div className="skeleton-sweep h-4 w-1/3 rounded bg-slate-200" />
        <div className="skeleton-sweep h-10 w-2/3 rounded bg-slate-200" />
        <div className="skeleton-sweep mt-8 h-40 w-full rounded bg-slate-200" />
      </div>
    </section>
  );
}
