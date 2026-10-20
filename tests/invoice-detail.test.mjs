import test from "node:test";
import assert from "node:assert/strict";

const {
  INVOICE_STATUS_TRANSITIONS,
  canTransitionInvoiceStatus,
  effectiveInvoiceStatus,
  invoiceOverdueCutoff,
  isInvoiceStatus,
  sourceStatusForTransition,
} = await import("../src/lib/invoice-status.ts");

const {
  invoiceStatusUpdateSchema,
  invoiceUpdateSchema,
} = await import("../src/lib/invoice-schema.ts");

const { computeInvoiceTotals } = await import("../src/lib/invoice-totals.ts");

const NOW = new Date("2026-10-19T13:45:00.000Z");

test("the transition table allows only DRAFT -> SENT and SENT -> PAID", () => {
  assert.deepEqual(INVOICE_STATUS_TRANSITIONS, {
    DRAFT: ["SENT"],
    SENT: ["PAID"],
    PAID: [],
  });

  assert.equal(canTransitionInvoiceStatus("DRAFT", "SENT"), true);
  assert.equal(canTransitionInvoiceStatus("SENT", "PAID"), true);

  assert.equal(canTransitionInvoiceStatus("DRAFT", "PAID"), false);
  assert.equal(canTransitionInvoiceStatus("PAID", "SENT"), false);
  assert.equal(canTransitionInvoiceStatus("PAID", "PAID"), false);
  assert.equal(canTransitionInvoiceStatus("SENT", "SENT"), false);
  assert.equal(canTransitionInvoiceStatus("SENT", "DRAFT"), false);
  assert.equal(canTransitionInvoiceStatus("DRAFT", "DRAFT"), false);
});

test("PAID is terminal: nothing transitions out of it", () => {
  assert.deepEqual(INVOICE_STATUS_TRANSITIONS.PAID, []);

  for (const target of ["DRAFT", "SENT", "PAID"]) {
    assert.equal(
      canTransitionInvoiceStatus("PAID", target),
      false,
      `PAID -> ${target} must be rejected`
    );
  }
});

test("the required source status is derived from the transition table", () => {
  assert.equal(sourceStatusForTransition("SENT"), "DRAFT");
  assert.equal(sourceStatusForTransition("PAID"), "SENT");
  assert.equal(sourceStatusForTransition("DRAFT"), null);
});

test("only the three stored statuses are recognised", () => {
  assert.equal(isInvoiceStatus("DRAFT"), true);
  assert.equal(isInvoiceStatus("SENT"), true);
  assert.equal(isInvoiceStatus("PAID"), true);
  assert.equal(isInvoiceStatus("OVERDUE"), false);
  assert.equal(isInvoiceStatus("draft"), false);
});

test("the overdue cutoff is the current UTC day at midnight", () => {
  assert.equal(
    invoiceOverdueCutoff(new Date("2026-10-19T23:59:59.999Z")).toISOString(),
    "2026-10-19T00:00:00.000Z"
  );
});

test("a sent invoice with a past due date displays as OVERDUE", () => {
  const pastDue = new Date("2026-10-18T00:00:00.000Z");

  assert.equal(
    effectiveInvoiceStatus({ status: "SENT", dueDate: pastDue }, NOW),
    "OVERDUE"
  );
  assert.equal(
    effectiveInvoiceStatus(
      { status: "SENT", dueDate: new Date("2026-10-19T00:00:00.000Z") },
      NOW
    ),
    "SENT",
    "an invoice due today is still payable"
  );
});

test("a paid invoice is never overdue, whatever the due date", () => {
  assert.equal(
    effectiveInvoiceStatus(
      { status: "PAID", dueDate: new Date("2026-10-18T00:00:00.000Z") },
      NOW
    ),
    "PAID"
  );
  assert.equal(
    effectiveInvoiceStatus(
      { status: "PAID", dueDate: new Date("2020-01-01T00:00:00.000Z") },
      NOW
    ),
    "PAID"
  );
});

test("a draft invoice is never overdue", () => {
  assert.equal(
    effectiveInvoiceStatus(
      { status: "DRAFT", dueDate: new Date("2020-01-01T00:00:00.000Z") },
      NOW
    ),
    "DRAFT"
  );
});

test("the status update schema only accepts SENT and PAID", () => {
  assert.equal(invoiceStatusUpdateSchema.safeParse({ status: "SENT" }).success, true);
  assert.equal(invoiceStatusUpdateSchema.safeParse({ status: "PAID" }).success, true);

  for (const status of ["DRAFT", "OVERDUE", "draft", "SENT,PAID", "", 1, null]) {
    const result = invoiceStatusUpdateSchema.safeParse({ status });

    assert.equal(
      result.success,
      false,
      `status=${JSON.stringify(status)} must be rejected`
    );
  }
});

test("the status update schema rejects extra keys", () => {
  const result = invoiceStatusUpdateSchema.safeParse({
    status: "SENT",
    paidAt: "2026-10-19T00:00:00.000Z",
  });

  assert.equal(result.success, false);
});

test("the update schema follows the create rules and rejects server fields", () => {
  const valid = {
    clientId: "client-1",
    issueDate: "2026-10-19",
    dueDate: "2026-11-02",
    items: [{ description: "Design", quantity: 2, unitPriceCents: 50000 }],
  };

  const parsed = invoiceUpdateSchema.safeParse(valid);

  assert.equal(parsed.success, true);

  // The client may not change the number, status, owner, payment time or
  // any server-computed total.
  for (const extra of [
    { number: "INV-9999" },
    { status: "PAID" },
    { userId: "someone-else" },
    { paidAt: "2026-10-19T00:00:00.000Z" },
    { subtotalCents: 1 },
    { taxCents: 1 },
    { totalCents: 1 },
  ]) {
    const result = invoiceUpdateSchema.safeParse({ ...valid, ...extra });

    assert.equal(
      result.success,
      false,
      `${Object.keys(extra)[0]} must be rejected`
    );
  }
});

test("the update schema requires at least one line item", () => {
  assert.equal(
    invoiceUpdateSchema.safeParse({
      clientId: "client-1",
      issueDate: "2026-10-19",
      dueDate: "2026-11-02",
      items: [],
    }).success,
    false
  );
});

test("totals after an edit are recomputed on the server to the cent", () => {
  const totals = computeInvoiceTotals(
    [{ quantity: 3, unitPriceCents: 334 }],
    8.25,
    2
  );

  assert.equal(totals.subtotalCents, 1002);
  assert.equal(totals.taxableCents, 1000);
  assert.equal(totals.taxCents, 83);
  assert.equal(totals.totalCents, 1083);
  assert.equal(Number.isInteger(totals.totalCents), true);
});
