import type { Prisma } from "@prisma/client";
import { invoiceOverdueCutoff } from "./invoice-status.ts";

// The overdue rules live in `@/lib/invoice-status` so the invoice list, the
// invoice detail page and the API share exactly one implementation. They are
// re-exported here because the list is their original home.
export {
  effectiveInvoiceStatus,
  invoiceOverdueCutoff,
} from "./invoice-status.ts";
export type { DisplayInvoiceStatus } from "./invoice-status.ts";

export type StoredInvoiceStatus = "DRAFT" | "SENT" | "PAID";

export type InvoiceListFilters = {
  search?: string;
  status?: StoredInvoiceStatus | "OVERDUE";
  sort: "date" | "amount";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
};

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
