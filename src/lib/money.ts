// The invoice totals live in `@/lib/invoice-totals` so the create route, the
// update route and the invoice form all share one implementation. They are
// re-exported here because this module is their original home.
export {
  computeInvoiceTotals,
  INVOICE_MAX_CENTS,
  InvoiceCalculationError,
} from "./invoice-totals.ts";

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

// Renders integer cents the way the invoice builder expects them back in a
// text input: "1234" -> "12.34".
export function formatCentsInput(cents: number): string {
  return (cents / 100).toFixed(2);
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
