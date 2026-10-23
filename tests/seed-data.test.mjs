import test from "node:test";
import assert from "node:assert/strict";

const { buildSeedData, paidRevenueRows } = await import(
  "../prisma/seed-data.ts"
);
const { computeInvoiceTotals } = await import("../src/lib/invoice-totals.ts");
const {
  buildMonthWindow,
  bucketPaidRevenue,
  invoiceOverdueCutoff,
  monthKeyFromUtc,
} = await import("../src/lib/dashboard-data.ts");

const BASE_NOW = new Date("2026-10-20T13:45:00Z");

// Month-edge "now" values: end-of-month, start-of-year (window crosses the
// year boundary), and the very first instant of a month (the paidAt clamp
// has nowhere to go forward).
const NOW_CASES = [
  BASE_NOW,
  new Date("2026-01-31T23:59:59.500Z"),
  new Date("2026-03-31T00:00:00Z"),
  new Date("2026-01-01T00:30:00Z"),
  new Date("2028-02-29T12:00:00Z"),
  new Date("2026-12-31T23:59:59Z"),
];

function serialize(invoices) {
  return invoices.map((invoice) => ({
    ...invoice,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
  }));
}

function assertInvariants(data, now) {
  const cutoff = invoiceOverdueCutoff(now);
  const windowKeys = buildMonthWindow(now, 6);

  // Shape and uniqueness.
  assert.ok(
    data.clients.length >= 5 && data.clients.length <= 8,
    "between 5 and 8 clients"
  );
  assert.equal(
    new Set(data.clients.map((client) => client.id)).size,
    data.clients.length,
    "unique client ids"
  );

  for (const client of data.clients) {
    assert.match(client.id, /^demo-client-\d+$/);
    assert.match(client.email, /\.example\.(com|org)$/);
  }

  assert.ok(
    data.invoices.length >= 10 && data.invoices.length <= 15,
    "between 10 and 15 invoices"
  );

  const numbers = data.invoices.map((invoice) => invoice.number);

  assert.equal(new Set(numbers).size, numbers.length, "unique numbers");
  assert.match(numbers[0], /^INV-\d{4}$/);

  const statuses = new Set(data.invoices.map((invoice) => invoice.status));

  assert.ok(statuses.has("PAID"));
  assert.ok(statuses.has("SENT"));
  assert.ok(statuses.has("DRAFT"));

  const sent = data.invoices.filter((invoice) => invoice.status === "SENT");
  const overdue = sent.filter(
    (invoice) => invoice.dueDate.getTime() < cutoff.getTime()
  );
  const outstanding = sent.filter(
    (invoice) => invoice.dueDate.getTime() >= cutoff.getTime()
  );

  assert.ok(overdue.length >= 2, "at least two overdue SENT invoices");
  assert.ok(outstanding.length >= 2, "at least two future-due SENT invoices");
  assert.ok(
    data.invoices.filter((invoice) => invoice.status === "DRAFT").length >= 2,
    "at least two DRAFT invoices"
  );

  for (const invoice of data.invoices) {
    // Line items and the totals equation.
    assert.ok(invoice.items.length >= 1, `${invoice.number} has items`);

    let subtotal = 0;

    for (const item of invoice.items) {
      assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1);
      assert.ok(
        Number.isSafeInteger(item.unitPriceCents) &&
          item.unitPriceCents >= 0
      );
      subtotal += item.quantity * item.unitPriceCents;
    }

    assert.equal(invoice.subtotalCents, subtotal, "subtotal = sum(items)");
    assert.ok(
      invoice.discountCents >= 0 && invoice.discountCents <= subtotal,
      "0 <= discount <= subtotal"
    );
    assert.deepEqual(
      {
        subtotalCents: invoice.subtotalCents,
        taxCents: invoice.taxCents,
        totalCents: invoice.totalCents,
      },
      (() => {
        const totals = computeInvoiceTotals(
          invoice.items,
          invoice.taxPercent,
          invoice.discountCents
        );

        return {
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
        };
      })(),
      "totals match computeInvoiceTotals"
    );
    assert.equal(
      invoice.totalCents,
      invoice.subtotalCents - invoice.discountCents + invoice.taxCents,
      "total = subtotal - discount + tax"
    );
    assert.ok(Number.isSafeInteger(invoice.totalCents));

    // Calendar sanity.
    assert.ok(
      invoice.issueDate.getTime() <= invoice.dueDate.getTime(),
      "issueDate <= dueDate"
    );

    if (invoice.status === "PAID") {
      assert.ok(invoice.paidAt, "paid invoices carry paidAt");
      assert.ok(
        invoice.paidAt.getTime() <= now.getTime(),
        "paidAt never in the future"
      );
      assert.ok(
        invoice.paidAt.getTime() >= invoice.issueDate.getTime(),
        "paidAt on or after issueDate"
      );
      assert.ok(
        windowKeys.includes(monthKeyFromUtc(invoice.paidAt)),
        "paidAt inside the last 6 UTC months"
      );
    } else {
      assert.equal(invoice.paidAt, null, "only PAID carries paidAt");
    }
  }

  // Every month of the chart window gets at least one paid invoice.
  const buckets = bucketPaidRevenue(paidRevenueRows(data), windowKeys);

  assert.equal(buckets.length, 6);

  for (const bucket of buckets) {
    assert.ok(
      bucket.amountCents > 0,
      `chart month ${bucket.month} is not empty`
    );
  }

  const distinctMonths = buckets.filter((bucket) => bucket.amountCents > 0)
    .length;

  assert.ok(distinctMonths >= 5, "at least five distinct paid months");
}

test("seed data satisfies every invariant for the base month", () => {
  assertInvariants(buildSeedData(BASE_NOW), BASE_NOW);
});

test("seed data satisfies every invariant at month and year edges", () => {
  for (const now of NOW_CASES) {
    assertInvariants(buildSeedData(now), now);
  }
});

test("buildSeedData is deterministic for a fixed now", () => {
  const first = buildSeedData(BASE_NOW);
  const second = buildSeedData(BASE_NOW);

  assert.deepEqual(serialize(first.invoices), serialize(second.invoices));
  assert.deepEqual(first.clients, second.clients);
  assert.deepEqual(first.profile, second.profile);

  // The pure builder returns fresh copies, not shared mutable rows.
  first.invoices[0].items[0].quantity = 999;

  assert.notEqual(buildSeedData(BASE_NOW).invoices[0].items[0].quantity, 999);
});

test("seeded paid rows produce a non-empty six-bar chart", () => {
  const data = buildSeedData(BASE_NOW);
  const buckets = bucketPaidRevenue(
    paidRevenueRows(data),
    buildMonthWindow(BASE_NOW, 6)
  );

  assert.equal(
    buckets.reduce((sum, bucket) => sum + bucket.amountCents, 0),
    data.invoices
      .filter((invoice) => invoice.status === "PAID")
      .reduce((sum, invoice) => sum + invoice.totalCents, 0),
    "the chart sums to the paid revenue in the window"
  );
  assert.ok(buckets.every((bucket) => bucket.amountCents > 0));
});
