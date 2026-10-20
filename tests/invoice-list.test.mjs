import test from "node:test";
import assert from "node:assert/strict";

const { parseInvoiceListQuery } = await import("../src/lib/validation.ts");
const {
  buildInvoiceListWhere,
  buildInvoiceListOrderBy,
  effectiveInvoiceStatus,
  invoiceOverdueCutoff,
} = await import("../src/lib/invoice-list.ts");

const NOW = new Date("2026-10-19T13:45:00.000Z");

function okQuery(overrides = {}) {
  const result = parseInvoiceListQuery({
    sort: "date",
    order: "desc",
    page: "1",
    pageSize: "10",
    ...overrides,
  });

  assert.equal(result.success, true, JSON.stringify(overrides));

  if (!result.success) {
    throw new Error("unreachable");
  }

  return result.data;
}

function rejected(overrides) {
  const result = parseInvoiceListQuery({
    sort: "date",
    order: "desc",
    page: "1",
    pageSize: "10",
    ...overrides,
  });

  assert.equal(result.success, false, JSON.stringify(overrides));

  return result;
}

test("query defaults are sort=date, order=desc, page=1, pageSize=10", () => {
  const result = parseInvoiceListQuery({});

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.search, undefined);
    assert.equal(result.data.status, undefined);
    assert.equal(result.data.sort, "date");
    assert.equal(result.data.order, "desc");
    assert.equal(result.data.page, 1);
    assert.equal(result.data.pageSize, 10);
  }
});

test("query accepts valid enums, numbers and search text", () => {
  const data = okQuery({
    search: "  INV-7  ",
    status: "OVERDUE",
    sort: "amount",
    order: "asc",
    page: "3",
    pageSize: "50",
  });

  assert.equal(data.search, "INV-7");
  assert.equal(data.status, "OVERDUE");
  assert.equal(data.sort, "amount");
  assert.equal(data.order, "asc");
  assert.equal(data.page, 3);
  assert.equal(data.pageSize, 50);
});

test("query rejects invalid status enums without coercion", () => {
  for (const status of ["NOPE", "draft", "Overdue", "", "SENT,PAID"]) {
    const result = rejected({ status });
    assert.equal(
      result.error.issues.some((issue) => issue.path.includes("status")),
      true,
      `status=${JSON.stringify(status)} must be rejected`
    );
  }
});

test("query rejects non-integer, zero, negative and oversized paging", () => {
  for (const value of ["0", "-1", "-2", "1.5", "abc", "1e2", " ", "01x"]) {
    rejected({ page: value });
    rejected({ pageSize: value });
  }

  rejected({ pageSize: "51" });
  rejected({ pageSize: "1000" });
});

test("query rejects unknown parameters and invalid sort or order", () => {
  rejected({ foo: "bar" });
  rejected({ status: "SENT", extra: "1" });
  rejected({ sort: "dueDate" });
  rejected({ sort: "DATE" });
  rejected({ order: "descending" });
  rejected({ order: "ASC" });
});

test("empty or whitespace search is treated as no filter", () => {
  assert.equal(okQuery({ search: "   " }).search, undefined);
  assert.equal(okQuery({ search: "" }).search, undefined);
});

test("invoiceOverdueCutoff is the current UTC day at midnight", () => {
  assert.equal(
    invoiceOverdueCutoff(new Date("2026-10-19T23:59:59.999Z")).toISOString(),
    "2026-10-19T00:00:00.000Z"
  );
  assert.equal(
    invoiceOverdueCutoff(new Date("2026-10-19T00:00:00.000Z")).toISOString(),
    "2026-10-19T00:00:00.000Z"
  );
});

test("effective status marks past-due SENT invoices OVERDUE only", () => {
  const pastDue = new Date("2026-10-18T00:00:00.000Z");
  const dueToday = new Date("2026-10-19T00:00:00.000Z");
  const futureDue = new Date("2026-10-20T00:00:00.000Z");

  assert.equal(effectiveInvoiceStatus({ status: "SENT", dueDate: pastDue }, NOW), "OVERDUE");
  assert.equal(effectiveInvoiceStatus({ status: "SENT", dueDate: dueToday }, NOW), "SENT");
  assert.equal(effectiveInvoiceStatus({ status: "SENT", dueDate: futureDue }, NOW), "SENT");
  assert.equal(
    effectiveInvoiceStatus({ status: "PAID", dueDate: pastDue }, NOW),
    "PAID",
    "paid invoices are never overdue"
  );
  assert.equal(
    effectiveInvoiceStatus({ status: "DRAFT", dueDate: pastDue }, NOW),
    "DRAFT",
    "drafts are never overdue"
  );
});

test("where builder always scopes to the session user", () => {
  const where = buildInvoiceListWhere(
    "user-1",
    { search: "INV", status: "PAID" },
    NOW
  );

  assert.deepEqual(where, {
    AND: [
      { userId: "user-1" },
      {
        OR: [
          { number: { contains: "INV", mode: "insensitive" } },
          { client: { name: { contains: "INV", mode: "insensitive" } } },
        ],
      },
      { status: "PAID" },
    ],
  });
});

test("where builder applies status semantics with overdue cutoff", () => {
  const cutoff = "2026-10-19T00:00:00.000Z";

  assert.deepEqual(buildInvoiceListWhere("u", {}, NOW), {
    AND: [{ userId: "u" }],
  });
  assert.deepEqual(buildInvoiceListWhere("u", { status: "DRAFT" }, NOW), {
    AND: [{ userId: "u" }, { status: "DRAFT" }],
  });
  assert.deepEqual(buildInvoiceListWhere("u", { status: "SENT" }, NOW), {
    AND: [
      { userId: "u" },
      { status: "SENT", dueDate: { gte: new Date(cutoff) } },
    ],
  });
  assert.deepEqual(buildInvoiceListWhere("u", { status: "OVERDUE" }, NOW), {
    AND: [
      { userId: "u" },
      { status: "SENT", dueDate: { lt: new Date(cutoff) } },
    ],
  });
});

test("order builder sorts by date or amount with stable tie-break", () => {
  assert.deepEqual(
    buildInvoiceListOrderBy({ sort: "date", order: "asc" }),
    [{ issueDate: "asc" }, { id: "asc" }]
  );
  assert.deepEqual(
    buildInvoiceListOrderBy({ sort: "date", order: "desc" }),
    [{ issueDate: "desc" }, { id: "asc" }]
  );
  assert.deepEqual(
    buildInvoiceListOrderBy({ sort: "amount", order: "asc" }),
    [{ totalCents: "asc" }, { id: "asc" }]
  );
  assert.deepEqual(
    buildInvoiceListOrderBy({ sort: "amount", order: "desc" }),
    [{ totalCents: "desc" }, { id: "asc" }]
  );
});
