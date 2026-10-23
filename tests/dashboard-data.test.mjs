import test from "node:test";
import assert from "node:assert/strict";

const {
  buildMonthWindow,
  bucketPaidRevenue,
  chartBarRatios,
  invoiceOverdueCutoff,
  isOutstandingDueDate,
  monthKeyFromUtc,
  monthWindowStart,
} = await import("../src/lib/dashboard-data.ts");
const { effectiveInvoiceStatus } = await import("../src/lib/invoice-status.ts");

test("buildMonthWindow returns exactly 6 UTC months, oldest first", () => {
  const window = buildMonthWindow(new Date("2026-10-20T13:45:00Z"));

  assert.deepEqual(window, [
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ]);
});

test("buildMonthWindow crosses the year boundary", () => {
  assert.deepEqual(buildMonthWindow(new Date("2026-01-15T00:00:01Z")), [
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
  ]);
});

test("buildMonthWindow is stable at the end of short months", () => {
  // Day-based subtraction would drift here; month shifting must not.
  assert.deepEqual(buildMonthWindow(new Date("2026-01-31T23:59:59Z")), [
    buildMonthWindow(new Date("2026-01-01T00:00:00Z"))[0],
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
  ]);

  const march = buildMonthWindow(new Date("2026-03-31T12:00:00Z"));
  assert.equal(march.length, 6);
  assert.equal(march[5], "2026-03");
  assert.equal(march[0], "2025-10");

  // A February 29 window (leap year) never skips or duplicates months.
  const feb = buildMonthWindow(new Date("2028-02-29T12:00:00Z"));
  assert.deepEqual(feb, [
    "2027-09",
    "2027-10",
    "2027-11",
    "2027-12",
    "2028-01",
    "2028-02",
  ]);
});

test("buildMonthWindow rejects bad counts", () => {
  assert.throws(() => buildMonthWindow(new Date(), 0), RangeError);
  assert.throws(() => buildMonthWindow(new Date(), 1.5), RangeError);
});

test("monthKeyFromUtc and monthWindowStart use UTC", () => {
  assert.equal(monthKeyFromUtc(new Date("2026-10-01T00:00:00Z")), "2026-10");
  assert.equal(monthKeyFromUtc(new Date("2026-09-30T23:59:59.999Z")), "2026-09");
  assert.equal(monthKeyFromUtc(null), null);
  assert.equal(
    monthWindowStart(["2025-08", "2025-09"]).getTime(),
    Date.UTC(2025, 7, 1)
  );
});

test("bucketPaidRevenue zero-fills every window month, oldest first", () => {
  const window = buildMonthWindow(new Date("2026-10-20T00:00:00Z"));
  const buckets = bucketPaidRevenue(
    [
      { paidAt: new Date("2026-10-05T08:00:00Z"), totalCents: 40000 },
      { paidAt: new Date("2026-07-31T23:59:59Z"), totalCents: 1234 },
      { paidAt: new Date("2026-07-01T00:00:00Z"), totalCents: 2 },
    ],
    window
  );

  assert.deepEqual(buckets, [
    { month: "2026-05", amountCents: 0 },
    { month: "2026-06", amountCents: 0 },
    { month: "2026-07", amountCents: 1236 },
    { month: "2026-08", amountCents: 0 },
    { month: "2026-09", amountCents: 0 },
    { month: "2026-10", amountCents: 40000 },
  ]);
});

test("bucketPaidRevenue ignores null paidAt and out-of-window rows", () => {
  const window = buildMonthWindow(new Date("2026-10-01T00:00:00Z"));
  const buckets = bucketPaidRevenue(
    [
      { paidAt: null, totalCents: 999999 },
      { paidAt: new Date("2025-12-31T23:59:59Z"), totalCents: 500 },
      { paidAt: new Date("2026-10-15T10:00:00Z"), totalCents: 700 },
    ],
    window
  );

  const total = buckets.reduce((sum, bucket) => sum + bucket.amountCents, 0);

  assert.equal(total, 700);
  assert.equal(buckets[5].amountCents, 700);
});

test("bucketPaidRevenue sums cent-exact with integer addition only", () => {
  const window = ["2026-10"];
  const buckets = bucketPaidRevenue(
    [
      { paidAt: new Date("2026-10-02T00:00:00Z"), totalCents: 7 },
      { paidAt: new Date("2026-10-03T00:00:00Z"), totalCents: 3 },
      { paidAt: new Date("2026-10-04T00:00:00Z"), totalCents: 9007199254740000 },
    ],
    window
  );

  // 0.07 + 0.03 must be exactly 0.10 and the huge safe-integer sum must
  // not drift: float math on dollars would lose these.
  assert.equal(buckets[0].amountCents, 9007199254740010);

  assert.throws(
    () => bucketPaidRevenue([{ paidAt: new Date(), totalCents: 10.5 }], window),
    RangeError
  );
  assert.throws(
    () => bucketPaidRevenue([{ paidAt: new Date(), totalCents: -1 }], window),
    RangeError
  );
});

test("outstanding vs overdue uses the same UTC-day cutoff as the status badge", () => {
  const now = new Date("2026-10-20T17:00:00Z");
  const cutoff = invoiceOverdueCutoff(now);

  assert.equal(cutoff.getTime(), Date.UTC(2026, 9, 20));

  // Due today: still outstanding, not overdue yet.
  assert.equal(isOutstandingDueDate(new Date(Date.UTC(2026, 9, 20)), now), true);
  assert.equal(
    effectiveInvoiceStatus({ status: "SENT", dueDate: new Date(Date.UTC(2026, 9, 20)) }, now),
    "SENT"
  );

  // Due yesterday at midnight: the exact boundary flips both together.
  const boundary = new Date(Date.UTC(2026, 9, 19, 23, 59, 59, 999));
  assert.equal(isOutstandingDueDate(boundary, now), false);
  assert.equal(
    effectiveInvoiceStatus({ status: "SENT", dueDate: boundary }, now),
    "OVERDUE"
  );
  assert.equal(
    isOutstandingDueDate(boundary, now),
    effectiveInvoiceStatus({ status: "SENT", dueDate: boundary }, now) !==
      "OVERDUE"
  );

  // PAID is never outstanding or overdue in the badge rules.
  assert.equal(
    effectiveInvoiceStatus({ status: "PAID", dueDate: boundary }, now),
    "PAID"
  );
});

test("chartBarRatios scales to the maximum and handles all-zero data", () => {
  assert.deepEqual(chartBarRatios([0, 5000, 2500, 5000]), [
    0, 1, 0.5, 1,
  ]);
  assert.deepEqual(chartBarRatios([0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(chartBarRatios([]), []);
});
