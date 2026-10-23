// Server-side money math for invoices.
//
// Money is always integer cents. Tax is rounded half-up to the nearest cent
// exactly once; there is no floating point in the intermediate steps.
//
// This module has no imports so it can be shared by the API routes, the
// client form and the unit tests.

export const INVOICE_MAX_CENTS = 2_147_483_647;

export class InvoiceCalculationError extends Error {}

export function computeInvoiceTotals(
  items: Array<{ quantity: number; unitPriceCents: number }>,
  taxPercent: number,
  discountCents: number
): {
  subtotalCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
} {
  let subtotalCents = 0;

  for (const item of items) {
    const lineTotalCents = item.quantity * item.unitPriceCents;

    if (lineTotalCents > INVOICE_MAX_CENTS) {
      throw new InvoiceCalculationError(
        "A line item amount exceeds the supported range."
      );
    }

    subtotalCents += lineTotalCents;

    if (subtotalCents > INVOICE_MAX_CENTS) {
      throw new InvoiceCalculationError(
        "The subtotal exceeds the supported range."
      );
    }
  }

  if (discountCents > subtotalCents) {
    throw new InvoiceCalculationError(
      "Discount cannot exceed the subtotal."
    );
  }

  const taxableCents = subtotalCents - discountCents;
  const hundredths = Math.round(taxPercent * 100);
  const taxCents = Math.round((taxableCents * hundredths) / 10_000);
  const totalCents = taxableCents + taxCents;

  if (taxCents > INVOICE_MAX_CENTS || totalCents > INVOICE_MAX_CENTS) {
    throw new InvoiceCalculationError(
      "The invoice total exceeds the supported range."
    );
  }

  return { subtotalCents, taxableCents, taxCents, totalCents };
}
