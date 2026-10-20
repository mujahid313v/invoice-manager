import Link from "next/link";
import { notFound } from "next/navigation";
import {
  InvoiceForm,
  type InvoiceFormInitialValues,
} from "@/components/invoice-form";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth";
import { findInvoiceForUser } from "@/lib/invoices";
import { formatDateOnly } from "@/lib/money";

export const dynamic = "force-dynamic";

type EditInvoicePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditInvoicePage({
  params,
}: EditInvoicePageProps) {
  const user = await requirePageUser();
  const { id } = await params;

  const invoice = await findInvoiceForUser(user.id, id);

  // Missing invoices and invoices owned by somebody else are
  // indistinguishable to the caller.
  if (!invoice) {
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
            Edit {invoice.number}
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
            href={`/invoices/${invoice.id}`}
          >
            Back to invoice
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="mt-10">
        {invoice.status === "DRAFT" ? (
          <InvoiceForm
            mode="edit"
            invoiceId={invoice.id}
            initialValues={
              {
                clientId: invoice.clientId,
                issueDate: formatDateOnly(invoice.issueDate),
                dueDate: formatDateOnly(invoice.dueDate),
                taxPercent: String(invoice.taxPercent.toNumber()),
                discountCents: invoice.discountCents,
                items: invoice.items.map((item) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unitPriceCents: item.unitPriceCents,
                })),
              } satisfies InvoiceFormInitialValues
            }
          />
        ) : (
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
        )}
      </div>
    </main>
  );
}
