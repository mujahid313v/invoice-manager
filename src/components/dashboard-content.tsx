import type { ReactNode } from "react";
import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { chartBarRatios, type DashboardData } from "@/lib/dashboard-data";
import { formatCentsDisplay } from "@/lib/money-display";

// Server-rendered dashboard body: stat cards, a dependency-free bar chart
// and the latest invoices. Everything is plain HTML/CSS, so there is no
// client bundle and the chart degrades gracefully at 360px width.

const cardClassName =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:p-6";

// "2026-10" -> a localized month label, always evaluated in UTC so the
// label matches the UTC month bucket it belongs to.
export function formatMonthLabel(monthKey: string, locale: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);

  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

function resolveLocale(acceptLanguage: string | null): string {
  const candidate = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();

  if (!candidate) {
    return "en-US";
  }

  try {
    // Throws on a malformed language tag straight from the header.
    new Intl.DateTimeFormat(candidate);

    return candidate;
  } catch {
    return "en-US";
  }
}

function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
  iconClass,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className={cardClassName}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-2 break-words text-2xl font-semibold tracking-tight ${accent}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function IconSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function RevenueChart({
  monthlyRevenue,
  currency,
  locale,
}: {
  monthlyRevenue: DashboardData["monthlyRevenue"];
  currency: string;
  locale: string;
}) {
  const amounts = monthlyRevenue.map((bucket) => bucket.amountCents);
  const ratios = chartBarRatios(amounts);
  const hasRevenue = amounts.some((amount) => amount > 0);

  const summary = monthlyRevenue
    .map(
      (bucket) =>
        `${formatMonthLabel(bucket.month, locale)} ${formatCentsDisplay(
          bucket.amountCents,
          currency
        )}`
    )
    .join(", ");

  return (
    <section className={`${cardClassName} mt-6`}>
      <h2 className="text-sm font-semibold text-slate-900">
        Revenue, last 6 months
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Paid invoices grouped by the month they were paid.
      </p>

      <div
        className="mt-6"
        role="img"
        aria-label={`Bar chart of paid revenue for the last 6 months: ${summary}.`}
      >
        <div className="flex h-40 items-end gap-2 border-b border-slate-200 sm:gap-4">
          {monthlyRevenue.map((bucket, index) => {
            const ratio = ratios[index];

            return (
              <div
                key={bucket.month}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className="mb-1 max-w-full truncate text-[10px] font-medium text-slate-600 sm:text-xs">
                  {ratio > 0
                    ? formatCentsDisplay(bucket.amountCents, currency)
                    : ""}
                </span>
                {ratio > 0 ? (
                  <div
                    aria-hidden="true"
                    className="anim-bar w-full max-w-12 rounded-t-md bg-gradient-to-b from-emerald-500 to-emerald-600 transition-[filter] duration-150 hover:brightness-110"
                    style={{
                      height: `${Math.max(ratio * 100, 2)}%`,
                      animationDelay: `${index * 70}ms`,
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="h-0.5 w-full max-w-12 rounded-full bg-slate-200"
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2 sm:gap-4">
          {monthlyRevenue.map((bucket) => (
            <span
              key={bucket.month}
              className="min-w-0 flex-1 text-center text-[10px] font-medium text-slate-500 sm:text-xs"
            >
              {formatMonthLabel(bucket.month, locale)}
            </span>
          ))}
        </div>
      </div>

      {!hasRevenue ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No paid invoices in the last 6 months.
        </p>
      ) : null}

      <table className="sr-only">
        <caption>Monthly paid revenue, last 6 months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {monthlyRevenue.map((bucket) => (
            <tr key={bucket.month}>
              <th scope="row">{formatMonthLabel(bucket.month, locale)}</th>
              <td>{formatCentsDisplay(bucket.amountCents, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DashboardContent({
  data,
  acceptLanguage,
}: {
  data: DashboardData;
  acceptLanguage: string | null;
}) {
  const locale = resolveLocale(acceptLanguage);
  const { currency } = data;

  if (data.totalInvoiceCount === 0) {
    return (
      <div className="space-y-6">
        <section className="anim-rise rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Nothing here yet
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Create your first invoice and this dashboard will show revenue,
            outstanding amounts and your latest activity.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
              href="/invoices/new"
            >
              Create your first invoice
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-[border-color,color,transform] duration-150 ease-out hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
              href="/clients"
            >
              Add a client
            </Link>
          </div>
          {!data.hasBusinessProfile ? (
            <p className="mt-4 text-xs text-slate-500">
              Tip: set up your{" "}
              <Link
                className="font-semibold text-slate-700 underline-offset-2 hover:underline"
                href="/settings"
              >
                business profile
              </Link>{" "}
              so invoices and totals show your name and currency.
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        aria-label="Headline numbers"
        className="anim-rise-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Total revenue"
          value={formatCentsDisplay(data.totalRevenueCents, currency)}
          hint={`${data.paidCount} paid ${data.paidCount === 1 ? "invoice" : "invoices"}`}
          accent="text-emerald-700"
          iconClass="bg-emerald-50 text-emerald-700"
          icon={
            <IconSvg>
              <path d="M3 8.5h18M3 8.5v9a1.5 1.5 0 0 0 1.5 1.5h15a1.5 1.5 0 0 0 1.5-1.5v-9M3 8.5 5.5 5h13L21 8.5" />
              <path d="M12 13.5v.01" />
            </IconSvg>
          }
        />
        <StatCard
          label="Outstanding"
          value={formatCentsDisplay(data.outstandingCents, currency)}
          hint="Sent, not yet due"
          accent="text-slate-900"
          iconClass="bg-blue-50 text-blue-700"
          icon={
            <IconSvg>
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </IconSvg>
          }
        />
        <StatCard
          label="Overdue"
          value={formatCentsDisplay(data.overdueCents, currency)}
          hint={
            data.overdueCount > 0
              ? `${data.overdueCount} past due`
              : "Nothing past due"
          }
          accent={data.overdueCount > 0 ? "text-red-700" : "text-slate-900"}
          iconClass={
            data.overdueCount > 0
              ? "bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-600"
          }
          icon={
            <IconSvg>
              <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
              <path d="M12 10.5v4M12 17.5v.01" />
            </IconSvg>
          }
        />
        <StatCard
          label="Invoices"
          value={String(data.totalInvoiceCount)}
          hint="All time"
          accent="text-slate-900"
          iconClass="bg-slate-100 text-slate-600"
          icon={
            <IconSvg>
              <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" />
              <path d="M14 3.5V8h4M10 12.5h5M10 16h5" />
            </IconSvg>
          }
        />
      </section>

      <RevenueChart
        monthlyRevenue={data.monthlyRevenue}
        currency={currency}
        locale={locale}
      />

      <section className={`${cardClassName} mt-0`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Latest invoices
          </h2>
          <Link
            className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline"
            href="/invoices"
          >
            View all invoices
          </Link>
        </div>

        {data.latestInvoices.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No invoices yet.</p>
        ) : (
          <>
            {/* Mobile: stacked cards, same pattern as the invoice detail. */}
            <ul className="mt-4 space-y-3 sm:hidden">
              {data.latestInvoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="rounded-xl border border-slate-200 p-4 transition-colors duration-150 ease-out hover:border-slate-300 hover:bg-slate-50/70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      className="min-w-0 break-all text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                      href={`/invoices/${invoice.id}`}
                    >
                      {invoice.number}
                    </Link>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                  <p className="mt-1 break-words text-sm text-slate-700">
                    {invoice.clientName}
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Due {invoice.dueDate} · Issued {invoice.issueDate}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCentsDisplay(invoice.totalCents, currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Number</th>
                    <th className="py-2 pr-4 font-semibold">Client</th>
                    <th className="py-2 pr-4 font-semibold">Issued</th>
                    <th className="py-2 pr-4 font-semibold">Due</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latestInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-slate-100 transition-colors duration-150 ease-out last:border-0 hover:bg-slate-50/70"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                          href={`/invoices/${invoice.id}`}
                        >
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="max-w-40 truncate py-3 pr-4 text-slate-700">
                        {invoice.clientName}
                      </td>
                      <td className="py-3 pr-4 text-slate-500">
                        {invoice.issueDate}
                      </td>
                      <td className="py-3 pr-4 text-slate-500">
                        {invoice.dueDate}
                      </td>
                      <td className="py-3 pr-4">
                        <InvoiceStatusBadge status={invoice.status} />
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-900">
                        {formatCentsDisplay(invoice.totalCents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
