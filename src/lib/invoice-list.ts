import type { Prisma } from "@prisma/client";

export type StoredInvoiceStatus = "DRAFT" | "SENT" | "PAID";

export type InvoiceListFilters = {
  search?: string;
  status?: StoredInvoiceStatus | "OVERDUE";
  sort: "date" | "amount";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
};

// dueDate is a UTC calendar date, so an invoice only becomes overdue once
// that day has fully passed; today is still payable.
export function invoiceOverdueCutoff(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export function effectiveInvoiceStatus(
  invoice: { status: string; dueDate: Date },
  now: Date = new Date()
): StoredInvoiceStatus | "OVERDUE" {
  if (
    invoice.status === "SENT" &&
    invoice.dueDate.getTime() < invoiceOverdueCutoff(now).getTime()
  ) {
    return "OVERDUE";
  }

  return invoice.status as StoredInvoiceStatus;
}

export function buildInvoiceListWhere(
  userId: string,
  query: Pick<InvoiceListFilters, "search" | "status">,
  now: Date = new Date()
): Prisma.InvoiceWhereInput {
  const and: Prisma.InvoiceWhereInput[] = [{ userId }];

  if (query.search) {
    and.push({
      OR: [
        { number: { contains: query.search, mode: "insensitive" } },
        { client: { name: { contains: query.search, mode: "insensitive" } } },
      ],
    });
  }

  if (query.status === "DRAFT" || query.status === "PAID") {
    and.push({ status: query.status });
  } else if (query.status === "SENT") {
    and.push({
      status: "SENT",
      dueDate: { gte: invoiceOverdueCutoff(now) },
    });
  } else if (query.status === "OVERDUE") {
    and.push({
      status: "SENT",
      dueDate: { lt: invoiceOverdueCutoff(now) },
    });
  }

  return { AND: and };
}

export function buildInvoiceListOrderBy(
  query: Pick<InvoiceListFilters, "sort" | "order">
): Prisma.InvoiceOrderByWithRelationInput[] {
  const primary =
    query.sort === "amount"
      ? { totalCents: query.order }
      : { issueDate: query.order };

  return [primary, { id: "asc" }];
}
