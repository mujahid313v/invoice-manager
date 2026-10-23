// Pure dashboard aggregation helpers: no Prisma, no React, no I/O.
//
// The month window and the revenue bucketing work exclusively with UTC
// calendar months ("YYYY-MM" keys) and integer cents, so the dashboard,
// its unit tests and the API route all agree on the same arithmetic.
//
// The overdue boundary is deliberately the same UTC-day cutoff used by
// `effectiveInvoiceStatus` (re-exported below): a SENT invoice whose due
// date is today is still outstanding, and the dashboard, the invoice list
// and the detail badge can therefore never disagree.

export { invoiceOverdueCutoff } from "./invoice-status.ts";
import { invoiceOverdueCutoff } from "./invoice-status.ts";

export type PaidRevenueRow = {
  paidAt: Date | null;
  totalCents: number;
};

export type MonthlyRevenueBucket = {
  month: string;
  amountCents: number;
};

// The last `count` UTC calendar months ending with the month of `now`,
// oldest first, as "YYYY-MM" keys. Month arithmetic is done by shifting
// (year, month) pairs, never by subtracting days, so short months and
// year boundaries cannot skip or duplicate a month.
export function buildMonthWindow(now: Date, count = 6): string[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError("Month window count must be a positive integer.");
  }

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const keys: string[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    // Date.UTC normalizes negative months into previous years for us.
    keys.push(monthKey(new Date(Date.UTC(year, month - offset, 1))));
  }

  return keys;
}

function monthKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

// The UTC "YYYY-MM" key of a moment. Null/invalid dates have no month.
export function monthKeyFromUtc(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }

  return monthKey(value);
}

// The first instant (UTC) of the oldest month in the window. Used as the
// `paidAt >=` bound so the DB only returns rows that can be bucketed.
export function monthWindowStart(monthKeys: readonly string[]): Date {
  const oldest = monthKeys[0];

  if (!oldest) {
    throw new RangeError("Month window must not be empty.");
  }

  return new Date(`${oldest}-01T00:00:00.000Z`);
}

// Sums paid rows into the window's months. Rows whose paidAt is null
// (legacy data) or outside the window are ignored here: they still count
// in the all-time revenue aggregate, they just cannot be bucketed.
export function bucketPaidRevenue(
  rows: readonly PaidRevenueRow[],
  monthKeys: readonly string[]
): MonthlyRevenueBucket[] {
  const totals = new Map<string, number>(
    monthKeys.map((key) => [key, 0] as const)
  );

  for (const row of rows) {
    const key = monthKeyFromUtc(row.paidAt);

    if (key === null || !totals.has(key)) {
      continue;
    }

    if (!Number.isSafeInteger(row.totalCents) || row.totalCents < 0) {
      throw new RangeError("Revenue rows must use non-negative cent totals.");
    }

    // Integer addition only: cent-exact by construction.
    totals.set(key, (totals.get(key) as number) + row.totalCents);
  }

  return monthKeys.map((month) => ({
    month,
    amountCents: totals.get(month) as number,
  }));
}

// Bar heights as 0..1 ratios of the largest amount. All-zero data yields
// all-zero ratios so the caller can draw a flat baseline instead of
// dividing by zero.
export function chartBarRatios(
  amounts: readonly number[]
): number[] {
  const max = amounts.reduce(
    (highest, amount) => (amount > highest ? amount : highest),
    0
  );

  if (max <= 0) {
    return amounts.map(() => 0);
  }

  return amounts.map((amount) =>
    amount <= 0 ? 0 : Math.min(1, amount / max)
  );
}

// The SENT/unpaid classification shared by the aggregates: outstanding
// means "not overdue yet", using exactly the effective-status cutoff.
export function isOutstandingDueDate(dueDate: Date, now: Date): boolean {
  return dueDate.getTime() >= invoiceOverdueCutoff(now).getTime();
}

export type DashboardLatestInvoice = {
  id: string;
  number: string;
  clientName: string;
  totalCents: number;
  issueDate: string;
  dueDate: string;
  status: string;
};

export type DashboardData = {
  totalRevenueCents: number;
  outstandingCents: number;
  overdueCount: number;
  overdueCents: number;
  paidCount: number;
  totalInvoiceCount: number;
  monthlyRevenue: MonthlyRevenueBucket[];
  latestInvoices: DashboardLatestInvoice[];
  currency: string;
  hasBusinessProfile: boolean;
};
