// Pure seed data builder for the demo account.
//
// No Prisma, no bcrypt, no React, no I/O: it only turns a "now" Date into
// deterministic, realistic demo data. `npm test` imports this module to
// prove the invariants before anything ever touches a database.
//
// Money follows the app's own rules: totals always come from
// `computeInvoiceTotals`, so seeded invoices satisfy the same
// subtotal - discount + tax = total equation as app-created ones.
// Dates are relative to `now` (UTC) so the dashboard's 6-month window is
// always full; re-running the seed refreshes them.

import { computeInvoiceTotals } from "../src/lib/invoice-totals.ts";
import {
  buildMonthWindow,
  monthKeyFromUtc,
  type PaidRevenueRow,
} from "../src/lib/dashboard-data.ts";

export type SeedClient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string | null;
};

export type SeedInvoiceItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type SeedInvoice = {
  number: string;
  clientKey: string;
  status: "DRAFT" | "SENT" | "PAID";
  issueDate: Date;
  dueDate: Date;
  paidAt: Date | null;
  taxPercent: number;
  discountCents: number;
  notes: string | null;
  items: SeedInvoiceItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type SeedProfile = {
  businessName: string;
  address: string;
  logoUrl: string | null;
  currency: string;
  defaultTaxPercent: number;
  paymentInstructions: string;
};

export type SeedData = {
  profile: SeedProfile;
  clients: SeedClient[];
  invoices: SeedInvoice[];
};

const PROFILE: SeedProfile = {
  businessName: "Brightline Studio",
  address: "1420 SW Morrison St, Suite 300\nPortland, OR 97201\nUnited States",
  logoUrl: null,
  currency: "USD",
  defaultTaxPercent: 10,
  paymentInstructions:
    "Payment by bank transfer (ACH or wire) within the terms on the invoice. Please quote the invoice number with your payment.",
};

// Deterministic ids with a prefix no generated cuid can ever match, so the
// seed can upsert clients (which have no unique business key) safely.
const CLIENTS: SeedClient[] = [
  {
    id: "demo-client-01",
    name: "Northwind Studio",
    email: "accounts@northwindstudio.example.com",
    phone: "+1 (503) 555-0134",
    address: "710 NW Couch St, Portland, OR 97209",
    notes: "Interior design firm. Prefers email invoicing.",
  },
  {
    id: "demo-client-02",
    name: "Beacon Coffee Co.",
    email: "ap@beaconcoffee.example.org",
    phone: "+1 (503) 555-0172",
    address: "1224 SE Belmont St, Portland, OR 97214",
    notes: null,
  },
  {
    id: "demo-client-03",
    name: "Harbor Light Realty",
    email: "billing@harborlight.example.com",
    phone: "+1 (206) 555-0119",
    address: "415 Pike St, Seattle, WA 98101",
    notes: null,
  },
  {
    id: "demo-client-04",
    name: "Pixel & Thread Apparel",
    email: "finance@pixelthread.example.com",
    phone: "+1 (415) 555-0146",
    address: "88 Bluxome St, San Francisco, CA 94107",
    notes: "Two storefronts, one headquarters.",
  },
  {
    id: "demo-client-05",
    name: "Cedar & Slate Architecture",
    email: "projects@cedarslate.example.org",
    phone: "+1 (971) 555-0187",
    address: "209 SW Ankeny St, Portland, OR 97204",
    notes: null,
  },
  {
    id: "demo-client-06",
    name: "Bright Path Tutoring",
    email: "admin@brightpathtutoring.example.com",
    phone: "+1 (720) 555-0163",
    address: "1601 Wewatta St, Denver, CO 80202",
    notes: null,
  },
  {
    id: "demo-client-07",
    name: "Meadow Lane Bakery",
    email: "orders@meadowlane.example.org",
    phone: "+1 (360) 555-0128",
    address: "519 Main St, Vancouver, WA 98660",
    notes: null,
  },
];

// Two ways to anchor an invoice's dates:
//  - "month": a paid invoice anchored to a window month (oldest = index 0),
//    paid on that month's `paidDay` (clamped into the past for the current
//    month so paidAt is never in the future).
//  - "relative": an open invoice dated around `now` by whole-day offsets.
type InvoiceSpec =
  | {
      number: string;
      clientKey: string;
      status: "PAID";
      monthIndex: number;
      paidDay: number;
      taxPercent: number;
      discountCents: number;
      notes: string | null;
      items: SeedInvoiceItem[];
    }
  | {
      number: string;
      clientKey: string;
      status: "DRAFT" | "SENT";
      issueDaysAgo: number;
      dueDaysOffset: number;
      taxPercent: number;
      discountCents: number;
      notes: string | null;
      items: SeedInvoiceItem[];
    };

const SPECS: InvoiceSpec[] = [
  // 7 PAID: one in each of the six window months plus a second in the
  // current month. This fills every chart bar.
  {
    number: "INV-0001",
    clientKey: "demo-client-01",
    status: "PAID",
    monthIndex: 0,
    paidDay: 15,
    taxPercent: 10,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Brand identity design", quantity: 1, unitPriceCents: 185000 },
      { description: "Logo refresh", quantity: 1, unitPriceCents: 45000 },
    ],
  },
  {
    number: "INV-0002",
    clientKey: "demo-client-02",
    status: "PAID",
    monthIndex: 1,
    paidDay: 6,
    taxPercent: 8.25,
    discountCents: 10000,
    notes: "Three-month hosting retainer, discounted per agreement.",
    items: [
      { description: "Website maintenance retainer", quantity: 3, unitPriceCents: 24900 },
      { description: "Monthly hosting and monitoring", quantity: 3, unitPriceCents: 4900 },
    ],
  },
  {
    number: "INV-0003",
    clientKey: "demo-client-03",
    status: "PAID",
    monthIndex: 2,
    paidDay: 22,
    taxPercent: 0,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Property listing photography package", quantity: 4, unitPriceCents: 35000 },
      { description: "Aerial add-on", quantity: 2, unitPriceCents: 12500 },
    ],
  },
  {
    number: "INV-0004",
    clientKey: "demo-client-04",
    status: "PAID",
    monthIndex: 3,
    paidDay: 9,
    taxPercent: 7.5,
    discountCents: 0,
    notes: "Net 30 per master services agreement.",
    items: [
      { description: "E-commerce product pages (per page)", quantity: 8, unitPriceCents: 9500 },
      { description: "Payment flow QA pass", quantity: 1, unitPriceCents: 68000 },
      { description: "Copywriting for product descriptions", quantity: 12, unitPriceCents: 3200 },
    ],
  },
  {
    number: "INV-0005",
    clientKey: "demo-client-05",
    status: "PAID",
    monthIndex: 4,
    paidDay: 18,
    taxPercent: 10,
    discountCents: 25000,
    notes: "Volume discount applied for five listing pages.",
    items: [
      { description: "Studio website design", quantity: 1, unitPriceCents: 325000 },
      { description: "Consulting (hourly)", quantity: 6, unitPriceCents: 15000 },
    ],
  },
  {
    number: "INV-0006",
    clientKey: "demo-client-06",
    status: "PAID",
    monthIndex: 5,
    paidDay: 15,
    taxPercent: 0,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Booking page redesign", quantity: 1, unitPriceCents: 145000 },
      { description: "Email template set", quantity: 5, unitPriceCents: 7500 },
    ],
  },
  {
    number: "INV-0007",
    clientKey: "demo-client-07",
    status: "PAID",
    monthIndex: 5,
    paidDay: 3,
    taxPercent: 8.25,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Seasonal menu photo shoot", quantity: 1, unitPriceCents: 98000 },
      { description: "Printed menu design (per menu)", quantity: 2, unitPriceCents: 12000 },
    ],
  },
  // 3 SENT with due dates clearly in the past -> shown as Overdue.
  {
    number: "INV-0008",
    clientKey: "demo-client-03",
    status: "SENT",
    issueDaysAgo: 60,
    dueDaysOffset: -45,
    taxPercent: 10,
    discountCents: 0,
    notes: "Follow-up call scheduled for next week.",
    items: [
      { description: "Listing video editing", quantity: 3, unitPriceCents: 22000 },
      { description: "Virtual staging (per room)", quantity: 4, unitPriceCents: 9500 },
    ],
  },
  {
    number: "INV-0009",
    clientKey: "demo-client-02",
    status: "SENT",
    issueDaysAgo: 35,
    dueDaysOffset: -18,
    taxPercent: 5,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Loyalty program landing page", quantity: 1, unitPriceCents: 88000 },
      { description: "Social campaign graphics (set)", quantity: 4, unitPriceCents: 22000 },
    ],
  },
  {
    number: "INV-0010",
    clientKey: "demo-client-04",
    status: "SENT",
    issueDaysAgo: 95,
    dueDaysOffset: -80,
    taxPercent: 0,
    discountCents: 15000,
    notes: "Reminder sent; awaiting client's accounts team.",
    items: [
      { description: "Lookbook layout design", quantity: 1, unitPriceCents: 165000 },
      { description: "Retouching (per image)", quantity: 20, unitPriceCents: 4500 },
    ],
  },
  // 2 SENT with future due dates -> Outstanding.
  {
    number: "INV-0011",
    clientKey: "demo-client-01",
    status: "SENT",
    issueDaysAgo: 5,
    dueDaysOffset: 12,
    taxPercent: 10,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Consulting (hourly)", quantity: 10, unitPriceCents: 15000 },
      { description: "Materials board refresh", quantity: 1, unitPriceCents: 38000 },
    ],
  },
  {
    number: "INV-0012",
    clientKey: "demo-client-05",
    status: "SENT",
    issueDaysAgo: 1,
    dueDaysOffset: 30,
    taxPercent: 7.5,
    discountCents: 5000,
    notes: null,
    items: [
      { description: "SEO audit and report", quantity: 1, unitPriceCents: 250000 },
      { description: "Ongoing SEO (monthly)", quantity: 1, unitPriceCents: 45000 },
    ],
  },
  // 2 DRAFT.
  {
    number: "INV-0013",
    clientKey: "demo-client-06",
    status: "DRAFT",
    issueDaysAgo: 2,
    dueDaysOffset: 14,
    taxPercent: 0,
    discountCents: 0,
    notes: "Needs the client's billing address before sending.",
    items: [
      { description: "Tutoring scheduling widget", quantity: 1, unitPriceCents: 120000 },
      { description: "Small content edits", quantity: 3, unitPriceCents: 9000 },
    ],
  },
  {
    number: "INV-0014",
    clientKey: "demo-client-07",
    status: "DRAFT",
    issueDaysAgo: 0,
    dueDaysOffset: 45,
    taxPercent: 10,
    discountCents: 0,
    notes: null,
    items: [
      { description: "Wholesale order catalog design", quantity: 1, unitPriceCents: 210000 },
      { description: "Packaging label variants", quantity: 6, unitPriceCents: 14500 },
    ],
  },
];

function dayUtcAt(offsetDays: number, now: Date, hour = 0): Date {
  // Date.UTC normalizes overflow into adjacent months for us.
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
      hour
    )
  );
}

function monthStart(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, 1));
}

function monthDayUtc(monthKey: string, day: number, hour: number): Date {
  const start = monthStart(monthKey);

  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day, hour)
  );
}

// A paidAt inside the given window month that is never in the future and
// never earlier than the month's first day (the issueDate we pair it with).
function paidAtInMonth(monthKey: string, day: number, now: Date): Date {
  const currentKey = monthKeyFromUtc(now);

  if (monthKey !== currentKey) {
    return monthDayUtc(monthKey, day, 10);
  }

  const latestDay = now.getUTCDate();
  const clampedDay = Math.min(day, latestDay, 28);

  if (clampedDay === latestDay) {
    // Same day as now: midnight of that day is always <= now.
    return monthDayUtc(monthKey, clampedDay, 0);
  }

  return monthDayUtc(monthKey, clampedDay, 10);
}

export function buildSeedData(now: Date = new Date()): SeedData {
  const window = buildMonthWindow(now, 6);
  const currentKey = window[window.length - 1];

  const invoices = SPECS.map((spec) => {
    let issueDate: Date;
    let dueDate: Date;
    let paidAt: Date | null = null;

    if (spec.status === "PAID") {
      const monthKey = window[spec.monthIndex];

      issueDate = monthStart(monthKey);
      dueDate =
        monthKey === currentKey
          ? dayUtcAt(0, now)
          : monthDayUtc(monthKey, Math.min(28, spec.paidDay + 5), 0);
      paidAt = paidAtInMonth(monthKey, spec.paidDay, now);

      if (issueDate.getTime() > paidAt.getTime()) {
        throw new Error(
          `Seed invariant broken: ${spec.number} was paid before it was issued.`
        );
      }
    } else {
      issueDate = dayUtcAt(-spec.issueDaysAgo, now);
      dueDate = dayUtcAt(spec.dueDaysOffset, now);
    }

    const totals = computeInvoiceTotals(
      spec.items,
      spec.taxPercent,
      spec.discountCents
    );

    return {
      number: spec.number,
      clientKey: spec.clientKey,
      status: spec.status,
      issueDate,
      dueDate,
      paidAt,
      taxPercent: spec.taxPercent,
      discountCents: spec.discountCents,
      notes: spec.notes,
      items: spec.items.map((item) => ({ ...item })),
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    } satisfies SeedInvoice;
  });

  return {
    profile: { ...PROFILE },
    clients: CLIENTS.map((client) => ({ ...client })),
    invoices,
  };
}

// Rows shaped for the dashboard's bucketing helper, so tests can prove the
// seed fills the revenue chart.
export function paidRevenueRows(data: SeedData): PaidRevenueRow[] {
  return data.invoices
    .filter((invoice) => invoice.status === "PAID")
    .map((invoice) => ({
      paidAt: invoice.paidAt,
      totalCents: invoice.totalCents,
    }));
}
