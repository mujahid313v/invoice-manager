import test from "node:test";
import assert from "node:assert/strict";

const {
  computeInvoiceTotals,
  formatInvoiceNumber,
  formatDateOnly,
  parseDateOnly,
  INVOICE_MAX_CENTS,
  InvoiceCalculationError,
} = await import("../src/lib/money.ts");
const { invoiceCreateSchema } = await import("../src/lib/validation.ts");

const validInvoice = {
  clientId: "client-1",
  issueDate: "2026-10-19",
  dueDate: "2026-11-02",
  items: [{ description: "Website design", quantity: 2, unitPriceCents: 50000 }],
};

test("computeInvoiceTotals sums line items exactly", () => {
  const totals = computeInvoiceTotals(
    [
      { quantity: 2, unitPriceCents: 50000 },
      { quantity: 3, unitPriceCents: 1999 },
    ],
    0,
    0
  );

  assert.deepEqual(totals, {
    subtotalCents: 105997,
    taxableCents: 105997,
    taxCents: 0,
    totalCents: 105997,
  });
});

test("computeInvoiceTotals rounds tax to the nearest cent", () => {
  const totals = computeInvoiceTotals(
    [{ quantity: 1, unitPriceCents: 1001 }],
    8.25,
    0
  );

  assert.equal(totals.taxCents, 83);
  assert.equal(totals.totalCents, 1084);
});

test("computeInvoiceTotals applies discount before tax", () => {
  const totals = computeInvoiceTotals(
    [{ quantity: 1, unitPriceCents: 10000 }],
    10,
    2500
  );

  assert.equal(totals.subtotalCents, 10000);
  assert.equal(totals.taxableCents, 7500);
  assert.equal(totals.taxCents, 750);
  assert.equal(totals.totalCents, 8250);
});

test("computeInvoiceTotals rejects a discount above the subtotal", () => {
  assert.throws(
    () =>
      computeInvoiceTotals(
        [{ quantity: 1, unitPriceCents: 1000 }],
        0,
        1001
      ),
    InvoiceCalculationError
  );
});

test("computeInvoiceTotals rejects amounts beyond the int range", () => {
  assert.throws(
    () =>
      computeInvoiceTotals(
        [{ quantity: 2, unitPriceCents: INVOICE_MAX_CENTS }],
        0,
        0
      ),
    InvoiceCalculationError
  );
});

test("formatInvoiceNumber pads to four digits", () => {
  assert.equal(formatInvoiceNumber(1), "INV-0001");
  assert.equal(formatInvoiceNumber(42), "INV-0042");
  assert.equal(formatInvoiceNumber(12345), "INV-12345");
});

test("parseDateOnly and formatDateOnly round-trip in UTC", () => {
  const date = parseDateOnly("2026-10-19");

  assert.equal(date.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(formatDateOnly(date), "2026-10-19");
});

test("invoiceCreateSchema accepts and normalizes a complete payload", () => {
  const result = invoiceCreateSchema.safeParse({
    ...validInvoice,
    items: [
      {
        description: "  Website design  ",
        quantity: 2,
        unitPriceCents: 50000,
      },
    ],
    taxPercent: 7.5,
    discountCents: 1000,
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.items[0].description, "Website design");
    assert.equal(result.data.taxPercent, 7.5);
    assert.equal(result.data.discountCents, 1000);
  }
});

test("invoiceCreateSchema rejects fabricated total fields", () => {
  const result = invoiceCreateSchema.safeParse({
    ...validInvoice,
    subtotalCents: 1,
    totalCents: 1,
  });

  assert.equal(result.success, false);
});

test("invoiceCreateSchema rejects empty items and bad line values", () => {
  assert.equal(
    invoiceCreateSchema.safeParse({ ...validInvoice, items: [] }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      items: [{ description: "  ", quantity: 1, unitPriceCents: 100 }],
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      items: [{ description: "x", quantity: 0, unitPriceCents: 100 }],
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      items: [{ description: "x", quantity: 1.5, unitPriceCents: 100 }],
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      items: [{ description: "x", quantity: 1, unitPriceCents: -1 }],
    }).success,
    false
  );
});

test("invoiceCreateSchema rejects bad dates, tax and discount values", () => {
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      issueDate: "2026-02-30",
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      dueDate: "not-a-date",
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      taxPercent: 101,
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      taxPercent: 8.001,
    }).success,
    false
  );
  assert.equal(
    invoiceCreateSchema.safeParse({
      ...validInvoice,
      discountCents: -1,
    }).success,
    false
  );
});
