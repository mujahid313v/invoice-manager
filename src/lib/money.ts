export const INVOICE_MAX_CENTS = 2_147_483_647;

export function formatInvoiceNumber(value: number): string {
  return `INV-${String(value).padStart(4, "0")}`;
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

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

export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

export function parseCentsInput(raw: string): number | null {
  const value = raw.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [dollars, fraction = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(cents) ? cents : null;
}
