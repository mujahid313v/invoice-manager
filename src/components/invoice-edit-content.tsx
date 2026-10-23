import Link from "next/link";
import { notFound } from "next/navigation";
import {
  InvoiceForm,
  type InvoiceFormInitialValues,
} from "@/components/invoice-form";
import { requirePageUser } from "@/lib/auth";
import { findInvoiceForUser } from "@/lib/invoices";
import { formatDateOnly } from "@/lib/money";

// The edit body. Rendered inside a Suspense boundary in the page, so an
// unowned invoice is answered with a real 404 status before streaming starts.
export async function InvoiceEditContent({
  invoiceId,
}: {
  invoiceId: string;
}) {
  const user = await requirePageUser();

  const invoice = await findInvoiceForUser(user.id, invoiceId);

  // The page already gated ownership. This only guards against the invoice
  // disappearing between the two queries.
  if (!invoice) {
    notFound();
  }

  if (invoice.status !== "DRAFT") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold text-slate-900">
          This invoice can no longer be edited
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">
          {invoice.status === "SENT"
            ? "This invoice has been sent, so its content is locked. Mark it as paid to finish it."
            : "This invoice has been paid, so its content is locked."}
        </p>
        <div className="mt-6">
          <Link
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            href={`/invoices/${invoice.id}`}
          >
            Back to invoice
          </Link>
        </div>
      </section>
    );
  }

  const initialValues = {
    clientId: invoice.clientId,
    issueDate: formatDateOnly(invoice.issueDate),
    dueDate: formatDateOnly(invoice.dueDate),
    taxPercent: String(invoice.taxPercent.toNumber()),
    discountCents: invoice.discountCents,
    notes: invoice.notes ?? "",
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  } satisfies InvoiceFormInitialValues;

  return <InvoiceForm mode="edit" invoiceId={invoice.id} initialValues={initialValues} />;
}
