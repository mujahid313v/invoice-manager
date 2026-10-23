// Canonical invoice status rules.
//
// The stored status is always one of DRAFT, SENT or PAID. OVERDUE is never
// stored: it is derived at read time from the due date (see
// `effectiveInvoiceStatus`), so it can never drift from the real data.
//
// This module has no runtime imports on purpose: it is shared by the API
// routes, the server components and the unit tests.
//
// Because `dueDate` is a calendar date (not a moment), an invoice only
// becomes overdue once that day has fully passed; today is still payable.

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID";

export type DisplayInvoiceStatus = InvoiceStatus | "OVERDUE";

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "PAID",
];

// The only allowed moves. PAID is terminal: nothing transitions out of it.
export const INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  DRAFT: ["SENT"],
  SENT: ["PAID"],
  PAID: [],
};

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

export function canTransitionInvoiceStatus(
  from: InvoiceStatus,
  to: InvoiceStatus
): boolean {
  return INVOICE_STATUS_TRANSITIONS[from].includes(to);
}

// The status an invoice must currently have to move to `target`, or null when
// the target is not reachable at all.
export function sourceStatusForTransition(
  target: InvoiceStatus
): InvoiceStatus | null {
  for (const [from, targets] of Object.entries(
    INVOICE_STATUS_TRANSITIONS
  ) as [InvoiceStatus, readonly InvoiceStatus[]][]) {
    if (targets.includes(target)) {
      return from;
    }
  }

  return null;
}

// The current UTC day at midnight.
export function invoiceOverdueCutoff(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

// The single source of truth for the status shown in the UI. OVERDUE is
// computed, never stored, and PAID is never overdue.
export function effectiveInvoiceStatus(
  invoice: { status: string; dueDate: Date },
  now: Date = new Date()
): DisplayInvoiceStatus {
  if (
    invoice.status === "SENT" &&
    invoice.dueDate.getTime() < invoiceOverdueCutoff(now).getTime()
  ) {
    return "OVERDUE";
  }

  return invoice.status as DisplayInvoiceStatus;
}
