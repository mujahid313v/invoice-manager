// Dashboard aggregation for one user. Both the /dashboard page and the
// GET /api/dashboard route call getDashboardForUser, so the numbers the
// user sees and the numbers the API exposes can never differ.
//
// Every query carries userId from the session in its where clause; the
// route reads no user input at all. Money stays in integer cents.

import { getPrisma } from "./prisma.ts";
import {
  bucketPaidRevenue,
  buildMonthWindow,
  monthWindowStart,
  invoiceOverdueCutoff,
  type DashboardData,
} from "./dashboard-data.ts";
import { effectiveInvoiceStatus } from "./invoice-status.ts";
import { normalizeDisplayCurrency } from "./money-display.ts";
import { formatDateOnly } from "./money.ts";

export async function getDashboardForUser(
  userId: string,
  now: Date = new Date()
): Promise<DashboardData> {
  const prisma = getPrisma();
  const cutoff = invoiceOverdueCutoff(now);
  const monthKeys = buildMonthWindow(now, 6);
  const windowStart = monthWindowStart(monthKeys);

  const [paidAggregate, outstandingAggregate, overdueAggregate, totalAggregate, paidRows, latest, profile] =
    await Promise.all([
      prisma.invoice.aggregate({
        where: { userId, status: "PAID" },
        _sum: { totalCents: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: {
          AND: [
            { userId },
            { status: "SENT" },
            { dueDate: { gte: cutoff } },
          ],
        },
        _sum: { totalCents: true },
      }),
      prisma.invoice.aggregate({
        where: {
          AND: [
            { userId },
            { status: "SENT" },
            { dueDate: { lt: cutoff } },
          ],
        },
        _sum: { totalCents: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { userId },
        _count: true,
      }),
      prisma.invoice.findMany({
        where: {
          userId,
          status: "PAID",
          paidAt: { gte: windowStart },
        },
        select: { paidAt: true, totalCents: true },
      }),
      prisma.invoice.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          number: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalCents: true,
          client: { select: { name: true } },
        },
      }),
      prisma.businessProfile.findUnique({
        where: { userId },
        select: { currency: true },
      }),
    ]);

  const currency = normalizeDisplayCurrency(profile?.currency);

  return {
    totalRevenueCents: paidAggregate._sum.totalCents ?? 0,
    outstandingCents: outstandingAggregate._sum.totalCents ?? 0,
    overdueCount: overdueAggregate._count,
    overdueCents: overdueAggregate._sum.totalCents ?? 0,
    paidCount: paidAggregate._count,
    totalInvoiceCount: totalAggregate._count,
    monthlyRevenue: bucketPaidRevenue(paidRows, monthKeys),
    latestInvoices: latest.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      clientName: invoice.client.name,
      totalCents: invoice.totalCents,
      issueDate: formatDateOnly(invoice.issueDate),
      dueDate: formatDateOnly(invoice.dueDate),
      status: effectiveInvoiceStatus(invoice, now),
    })),
    currency,
    hasBusinessProfile: profile !== null,
  };
}
