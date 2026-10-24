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

// The per-user table the seed promises: clients, invoices, currency and
// status mix (SENT is split by the overdue cutoff like the dashboard is).
const EXPECTED = {
  "demo@example.com": {
    prefix: "demo",
    clients: 7,
    invoices: 14,
    currency: "USD",
    paid: 7,
    overdue: 3,
    outstanding: 2,
    draft: 2,
  },
  "sara@example.com": {
    prefix: "sara",
    clients: 5,
    invoices: 12,
    currency: "USD",
    paid: 6,
    overdue: 2,
    outstanding: 2,
    draft: 2,
  },
  "rahul@example.com": {
    prefix: "rahul",
    clients: 6,
    invoices: 15,
    currency: "INR",
    paid: 8,
    overdue: 2,
    outstanding: 3,
    draft: 2,
  },
  "emma@example.com": {
    prefix: "emma",
    clients: 5,
    invoices: 10,
    currency: "EUR",
    paid: 6,
    overdue: 1,
    outstanding: 2,
    draft: 1,
  },
  "david@example.com": {
    prefix: "david",
    clients: 7,
    invoices: 18,
    currency: "GBP",
    paid: 9,
    overdue: 3,
    outstanding: 4,
    draft: 2,
  },
  "priya@example.com": {
    prefix: "priya",
    clients: 8,
    invoices: 20,
    currency: "INR",
    paid: 10,
    overdue: 3,
    outstanding: 5,
    draft: 2,
  },
};

function serialize(invoices) {
  return invoices.map((invoice) => ({
    ...invoice,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
  }));
}

function serializeAccounts(data) {
  return data.accounts.map((account) => ({
    email: account.email,
    profile: account.profile,
    clients: account.clients,
    invoices: serialize(account.invoices),
  }));
}

function assertAccountInvariants(account, now, expected) {
  const cutoff = invoiceOverdueCutoff(now);
  const windowKeys = buildMonthWindow(now, 6);

  // Profile.
  assert.equal(account.profile.currency, expected.currency);

  // Clients: shape and uniqueness.
  assert.equal(account.clients.length, expected.clients, "expected client count");
  assert.equal(
    new Set(account.clients.map((client) => client.id)).size,
    account.clients.length,
    "unique client ids"
  );

  for (const client of account.clients) {
    assert.match(client.id, new RegExp(`^${expected.prefix}-client-\\d{2}$`));
    assert.match(client.email, /\.example\.(com|org)$/);
  }

  const invoices = account.invoices;

  assert.equal(invoices.length, expected.invoices, "expected invoice count");

  const numbers = invoices.map((invoice) => invoice.number);

  assert.equal(new Set(numbers).size, numbers.length, "unique numbers");
  assert.match(numbers[0], /^INV-\d{4}$/);

  // Exact status mix.
  const sent = invoices.filter((invoice) => invoice.status === "SENT");
  const overdue = sent.filter(
    (invoice) => invoice.dueDate.getTime() < cutoff.getTime()
  );
  const outstanding = sent.filter(
    (invoice) => invoice.dueDate.getTime() >= cutoff.getTime()
  );

  assert.equal(
    invoices.filter((invoice) => invoice.status === "PAID").length,
    expected.paid,
    `${account.email} PAID count`
  );
  assert.equal(overdue.length, expected.overdue, `${account.email} overdue count`);
  assert.equal(
    outstanding.length,
    expected.outstanding,
    `${account.email} outstanding count`
  );
  assert.equal(
    invoices.filter((invoice) => invoice.status === "DRAFT").length,
    expected.draft,
    `${account.email} DRAFT count`
  );

  for (const invoice of invoices) {
    // The client reference exists in this account.
    assert.ok(
      account.clients.some((client) => client.id === invoice.clientKey),
      `${invoice.number} references a seeded client`
    );

    // Line items and the totals equation.
    assert.ok(invoice.items.length >= 1, `${invoice.number} has items`);

    let subtotal = 0;

    for (const item of invoice.items) {
      assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1);
      assert.ok(
        Number.isSafeInteger(item.unitPriceCents) && item.unitPriceCents >= 0
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
  const buckets = bucketPaidRevenue(paidRevenueRows(account), windowKeys);

  assert.equal(buckets.length, 6);

  for (const bucket of buckets) {
    assert.ok(
      bucket.amountCents > 0,
      `${account.email} chart month ${bucket.month} is not empty`
    );
  }
}

function assertAllAccounts(data, now) {
  assert.equal(data.accounts.length, 6, "six accounts");
  assert.deepEqual(
    data.accounts.map((account) => account.email),
    Object.keys(EXPECTED),
    "account emails match the table"
  );

  for (const account of data.accounts) {
    assertAccountInvariants(account, now, EXPECTED[account.email]);
  }
}

test("every seeded account satisfies its invariants for the base month", () => {
  assertAllAccounts(buildSeedData(BASE_NOW), BASE_NOW);
});

test("every seeded account satisfies its invariants at month and year edges", () => {
  for (const now of NOW_CASES) {
    assertAllAccounts(buildSeedData(now), now);
  }
});

test("buildSeedData is deterministic for a fixed now", () => {
  const first = buildSeedData(BASE_NOW);
  const second = buildSeedData(BASE_NOW);

  assert.deepEqual(serializeAccounts(first), serializeAccounts(second));

  // The pure builder returns fresh copies, not shared mutable rows.
  first.accounts[0].invoices[0].items[0].quantity = 999;
  first.accounts[1].clients[0].name = "Mutated";

  assert.notEqual(
    buildSeedData(BASE_NOW).accounts[0].invoices[0].items[0].quantity,
    999
  );
  assert.notEqual(buildSeedData(BASE_NOW).accounts[1].clients[0].name, "Mutated");
});

test("each account's paid rows produce a non-empty six-bar chart", () => {
  const data = buildSeedData(BASE_NOW);
  const windowKeys = buildMonthWindow(BASE_NOW, 6);

  for (const account of data.accounts) {
    const buckets = bucketPaidRevenue(
      paidRevenueRows(account),
      windowKeys
    );

    assert.equal(
      buckets.reduce((sum, bucket) => sum + bucket.amountCents, 0),
      account.invoices
        .filter((invoice) => invoice.status === "PAID")
        .reduce((sum, invoice) => sum + invoice.totalCents, 0),
      `${account.email}: the chart sums to the paid revenue in the window`
    );
    assert.ok(buckets.every((bucket) => bucket.amountCents > 0));
  }
});

test("the demo@example.com account keeps its hand-written 14 invoices", () => {
  const demo = buildSeedData(BASE_NOW).accounts.find(
    (account) => account.email === "demo@example.com"
  );

  assert.deepEqual(
    demo.invoices.map((invoice) => invoice.number),
    Array.from({ length: 14 }, (_, index) =>
      `INV-${String(index + 1).padStart(4, "0")}`
    )
  );
  assert.equal(demo.invoices[0].items[0].description, "Brand identity design");
  assert.equal(demo.invoices[1].discountCents, 10000);
  assert.equal(demo.profile.businessName, "Brightline Studio");
});
