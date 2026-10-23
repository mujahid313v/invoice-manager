import { notFound } from "next/navigation";
import { InvoiceActions } from "@/components/invoice-actions";
import { InvoicePdfDownloadButton } from "@/components/invoice-pdf-download-button";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { requirePageUser } from "@/lib/auth";
import { effectiveInvoiceStatus } from "@/lib/invoice-status";
import { findInvoiceForUser } from "@/lib/invoices";
import { formatDateOnly, formatMoney } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";

// The invoice body. It is rendered inside a Suspense boundary in the page,
// so the page can answer an unowned invoice with a real 404 status before
// the response starts streaming.
export async function InvoiceDetailContent({
  invoiceId,
  saved,
}: {
  invoiceId: string;
  saved?: string;
}) {
  const user = await requirePageUser();

  const [invoice, profile] = await Promise.all([
    findInvoiceForUser(user.id, invoiceId),
    getPrisma().businessProfile.findUnique({
      where: { userId: user.id },
      select: {
        businessName: true,
        address: true,
        logoUrl: true,
        currency: true,
        paymentInstructions: true,
      },
    }),
  ]);

  // The page already gated ownership. This only guards against the invoice
  // disappearing between the two queries.
  if (!invoice) {
    notFound();
  }

  const currency = profile?.currency ?? "USD";
  const displayStatus = effectiveInvoiceStatus(invoice);
  const itemCount = invoice.items.length;

  return (
    <>
      {saved === "edit" ? (
        <p
          className="anim-fade mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          role="status"
        >
          Invoice updated. Totals were recalculated on the server.
        </p>
      ) : null}
    <section className="anim-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900">
            {profile?.businessName ?? "Your business"}
          </h2>
          {profile?.address ? (
            <p className="mt-1 max-w-prose break-words text-sm leading-6 text-slate-600">
              {profile.address}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="text-2xl font-semibold tracking-tight text-slate-900">
            {invoice.number}
          </span>
          <InvoiceStatusBadge status={displayStatus} />
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Issue date
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {formatDateOnly(invoice.issueDate)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Due date
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {formatDateOnly(invoice.dueDate)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Billed to
          </dt>
          <dd className="mt-1 break-words text-sm text-slate-900">
            {invoice.client.name}
          </dd>
        </div>
      </dl>

      {invoice.client.email ||
      invoice.client.phone ||
      invoice.client.address ? (
        <div className="mt-4 break-words text-sm leading-6 text-slate-600">
          {invoice.client.email ? <p>{invoice.client.email}</p> : null}
          {invoice.client.phone ? <p>{invoice.client.phone}</p> : null}
          {invoice.client.address ? <p>{invoice.client.address}</p> : null}
        </div>
      ) : null}

      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Line items
        </h3>

        {itemCount === 0 ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            This invoice has no line items.
          </p>
        ) : (
          <>
            {/* Stacked rows keep the items readable on small screens without
                any horizontal page scrolling. */}
            <ul className="mt-4 space-y-3 sm:hidden">
              {invoice.items.map((item) => (
                <li
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  key={item.id}
                >
                  <p className="text-sm font-medium text-slate-900">
                    {item.description}
                  </p>
                  <dl className="mt-2 space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between gap-4">
                      <dt>Quantity</dt>
                      <dd className="font-medium text-slate-900">
                        {item.quantity}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Unit price</dt>
                      <dd className="font-medium text-slate-900">
                        {formatMoney(item.unitPriceCents, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Amount</dt>
                      <dd className="font-semibold text-slate-900">
                        {formatMoney(item.quantity * item.unitPriceCents, currency)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-3 pr-4 font-semibold">Description</th>
                    <th className="py-3 pr-4 font-semibold">Qty</th>
                    <th className="py-3 pr-4 font-semibold">Unit price</th>
                    <th className="py-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr
                      className="border-b border-slate-100 last:border-0"
                      key={item.id}
                    >
                      <td className="py-3.5 pr-4 text-slate-700">
                        {item.description}
                      </td>
                      <td className="py-3.5 pr-4 text-slate-700">
                        {item.quantity}
                      </td>
                      <td className="py-3.5 pr-4 text-slate-700">
                        {formatMoney(item.unitPriceCents, currency)}
                      </td>
                      <td className="py-3.5 font-medium text-slate-900">
                        {formatMoney(item.quantity * item.unitPriceCents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <dl className="mt-8 ml-auto max-w-xs space-y-2 border-t border-slate-200 pt-6 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-600">Subtotal</dt>
          <dd className="font-medium text-slate-900">
            {formatMoney(invoice.subtotalCents, currency)}
          </dd>
        </div>
        {invoice.discountCents > 0 ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-600">Discount</dt>
            <dd className="font-medium text-slate-900">
              −{formatMoney(invoice.discountCents, currency)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-600">
            Tax ({invoice.taxPercent.toNumber()}%)
          </dt>
          <dd className="font-medium text-slate-900">
            {formatMoney(invoice.taxCents, currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2">
          <dt className="font-semibold text-slate-900">Total</dt>
          <dd className="text-base font-semibold text-slate-900">
            {formatMoney(invoice.totalCents, currency)}
          </dd>
        </div>
      </dl>

      {invoice.notes ? (
        <div className="mt-8 border-t border-slate-200 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Notes
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {invoice.notes}
          </p>
        </div>
      ) : null}

      {profile?.paymentInstructions ? (
        <div className="mt-8 border-t border-slate-200 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Payment instructions
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {profile.paymentInstructions}
          </p>
        </div>
      ) : null}

      <InvoicePdfDownloadButton
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
      />

      <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
    </section>
    </>
  );
}
