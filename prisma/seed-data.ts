// Pure seed data builder for the six demo accounts.
//
// No Prisma, no bcrypt, no React, no I/O: it only turns a "now" Date into
// deterministic, realistic demo data. `npm test` imports this module to
// prove the invariants before anything ever touches a database.
//
// Money follows the app's own rules: totals always come from
// `computeInvoiceTotals`, so seeded invoices satisfy the same
// subtotal - discount + tax = total equation as app-created ones.
// Dates are relative to `now` (UTC) so each account's dashboard 6-month
// window is always full; re-running the seed refreshes them.
//
// The demo@example.com account is hand-written below. The other five
// accounts come from deterministic plan generators: every choice (client,
// line items, quantity, discount, note, dates) is a pure function of the
// invoice index, so two builds for the same `now` are identical.

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

export type SeedAccount = {
  email: string;
  profile: SeedProfile;
  clients: SeedClient[];
  invoices: SeedInvoice[];
};

export type SeedData = {
  accounts: SeedAccount[];
};

// ---------------------------------------------------------------------------
// demo@example.com — hand-written, 14 invoices across 7 clients.
// ---------------------------------------------------------------------------

const DEMO_PROFILE: SeedProfile = {
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
const DEMO_CLIENTS: SeedClient[] = [
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

const DEMO_SPECS: InvoiceSpec[] = [
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

// ---------------------------------------------------------------------------
// The five generated accounts.
// ---------------------------------------------------------------------------

// Pool entries carry no quantity: the generator derives quantity
// deterministically from the invoice index.
type SeedItemPoolEntry = {
  description: string;
  unitPriceCents: number;
};

type AccountPlan = {
  email: string;
  // Deterministic client-id prefix: `${idPrefix}-client-NN`.
  idPrefix: string;
  profile: SeedProfile;
  clients: SeedClient[];
  // Status mix, in the numbering order PAID -> overdue SENT -> future SENT
  // -> DRAFT. paidMonths lists a window-month index (0 = oldest) per PAID
  // invoice and must cover all six months so every chart bar has revenue.
  paidMonths: number[];
  overdueSent: number;
  futureSent: number;
  draft: number;
  // paidDay values for the PAID invoices, cycled; every value <= 28.
  paidDays: number[];
  // Exactly 10 entries so the index-based pick (step 3, coprime with 10)
  // never repeats an item within one invoice.
  itemPool: SeedItemPoolEntry[];
  notesPool: string[];
  // Some businesses honestly have tax-exempt lines (e.g. small US
  // freelancers in some states); only they get occasional 0% invoices.
  // VAT countries keep their rate on every invoice for realism.
  taxVariation?: boolean;
};

const ACCOUNT_PLANS: AccountPlan[] = [
  {
    email: "sara@example.com",
    idPrefix: "sara",
    profile: {
      businessName: "Sara Khan Web Development",
      address:
        "500 Congress Ave, Suite 200\nAustin, TX 78701\nUnited States",
      logoUrl: null,
      currency: "USD",
      defaultTaxPercent: 10,
      paymentInstructions:
        "Payment by ACH transfer or check within the terms on the invoice. Please include the invoice number on your payment.",
    },
    clients: [
      {
        id: "sara-client-01",
        name: "Lone Star BBQ Bros",
        email: "orders@lonestackbar.example.com",
        phone: "+1 (512) 555-0148",
        address: "3300 S Lamar Blvd, Austin, TX 78704",
        notes: "Three locations; the main site links to each.",
      },
      {
        id: "sara-client-02",
        name: "Hill Country Guides",
        email: "booking@hillcountryguides.example.org",
        phone: "+1 (830) 555-0126",
        address: "212 S Park St, New Braunfels, TX 78130",
        notes: null,
      },
      {
        id: "sara-client-03",
        name: "ATX Run Club",
        email: "board@atxrunclub.example.org",
        phone: "+1 (512) 555-0171",
        address: "901 W 30th St, Austin, TX 78705",
        notes: null,
      },
      {
        id: "sara-client-04",
        name: "Bluebonnet Bakery",
        email: "hello@bluebonnetbakery.example.com",
        phone: "+1 (737) 555-0113",
        address: "1801 E 6th St, Austin, TX 78702",
        notes: null,
      },
      {
        id: "sara-client-05",
        name: "Capital Fitness Lofts",
        email: "manager@capfitlofts.example.com",
        phone: "+1 (512) 555-0187",
        address: "4500 Burnet Rd, Austin, TX 78756",
        notes: "Renovating the member portal in phases.",
      },
    ],
    paidMonths: [0, 1, 2, 3, 4, 5],
    overdueSent: 2,
    futureSent: 2,
    draft: 2,
    paidDays: [12, 5, 19, 8, 14, 21],
    itemPool: [
      { description: "Front-end development (hourly)", unitPriceCents: 9500 },
      { description: "Landing page design", unitPriceCents: 75000 },
      { description: "E-commerce checkout build", unitPriceCents: 180000 },
      { description: "WordPress theme development", unitPriceCents: 65000 },
      { description: "Custom API integration", unitPriceCents: 120000 },
      { description: "Website performance audit", unitPriceCents: 45000 },
      { description: "Monthly maintenance retainer", unitPriceCents: 25000 },
      { description: "Hosting and monitoring (monthly)", unitPriceCents: 6000 },
      { description: "Bug-fix sprint", unitPriceCents: 90000 },
      { description: "Staff training session", unitPriceCents: 40000 },
    ],
    notesPool: [
      "Scope agreed over email; change requests billed at the hourly rate.",
      "Quarterly retainer for this period.",
      "Includes one round of revisions.",
      "Discounted for the referral from Bluebonnet Bakery.",
    ],
    taxVariation: true,
  },
  {
    email: "rahul@example.com",
    idPrefix: "rahul",
    profile: {
      businessName: "Rahul Digital Agency",
      address:
        "100 Outer Ring Road, 3rd Floor\nBengaluru, Karnataka 560103\nIndia",
      logoUrl: null,
      currency: "INR",
      defaultTaxPercent: 18,
      paymentInstructions:
        "Payment via UPI or NEFT to the account details on file. GST applies as shown; please quote the invoice number with your payment.",
    },
    clients: [
      {
        id: "rahul-client-01",
        name: "Masala Trail Cafes",
        email: "accounts@masalatrail.example.com",
        phone: "+91 98455 55101",
        address: "Indiranagar, Bengaluru, Karnataka 560038",
        notes: "Five cafes across Bengaluru; one consolidated invoice.",
      },
      {
        id: "rahul-client-02",
        name: "Silk Route Textiles",
        email: "marketing@silkroutetextiles.example.org",
        phone: "+91 98860 22114",
        address: "Commercial St, Bengaluru, Karnataka 560002",
        notes: null,
      },
      {
        id: "rahul-client-03",
        name: "Yoga Karma Studios",
        email: "studio@yogakarma.example.org",
        phone: "+91 99860 77432",
        address: "Koramangala, Bengaluru, Karnataka 560034",
        notes: null,
      },
      {
        id: "rahul-client-04",
        name: "TechNova Labs",
        email: "finance@technovalabs.example.com",
        phone: "+91 80471 33220",
        address: "Whitefield, Bengaluru, Karnataka 560066",
        notes: "Purchase orders arrive each quarter.",
      },
      {
        id: "rahul-client-05",
        name: "Spice Garden Hotels",
        email: "reservations@spicegardenhotels.example.com",
        phone: "+91 94480 15667",
        address: "MG Road, Bengaluru, Karnataka 560001",
        notes: null,
      },
      {
        id: "rahul-client-06",
        name: "Kite String Toys",
        email: "ops@kitestringtoys.example.org",
        phone: "+91 97411 88093",
        address: "Jayanagar, Bengaluru, Karnataka 560041",
        notes: null,
      },
    ],
    paidMonths: [0, 1, 2, 3, 4, 5, 5, 4],
    overdueSent: 2,
    futureSent: 3,
    draft: 2,
    paidDays: [10, 4, 17, 8, 22, 13, 6, 19],
    itemPool: [
      { description: "Social media campaign management (per month)", unitPriceCents: 4500000 },
      { description: "SEO audit and action plan", unitPriceCents: 8500000 },
      { description: "Google Ads management (per month)", unitPriceCents: 3000000 },
      { description: "Website design and development", unitPriceCents: 75000000 },
      { description: "Content writing (per article)", unitPriceCents: 350000 },
      { description: "Brand video production", unitPriceCents: 35000000 },
      { description: "Email marketing setup", unitPriceCents: 5500000 },
      { description: "App landing page", unitPriceCents: 25000000 },
      { description: "Infographic design (per piece)", unitPriceCents: 800000 },
      { description: "Analytics dashboard and report", unitPriceCents: 2000000 },
    ],
    notesPool: [
      "Campaign scope confirmed in the kickoff call.",
      "Monthly retainer under the annual agreement.",
      "Includes two revision rounds.",
      "GST invoiced at 18%; e-invoice generated.",
    ],
  },
  {
    email: "emma@example.com",
    idPrefix: "emma",
    profile: {
      businessName: "Emma Weber Photography",
      address: "Oranienstraße 12\n10999 Berlin\nGermany",
      logoUrl: null,
      currency: "EUR",
      defaultTaxPercent: 19,
      paymentInstructions:
        "Payment by SEPA transfer within the terms on the invoice. Please provide the invoice number as the payment reference.",
    },
    clients: [
      {
        id: "emma-client-01",
        name: "Berlin Wedding Planners",
        email: "kontakt@berlinweddingplanners.example.org",
        phone: "+49 30 5550 1240",
        address: "Prenzlauer Allee 88, 10405 Berlin",
        notes: "Refers most of her couples to me.",
      },
      {
        id: "emma-client-02",
        name: "Roastery Kreuzberg",
        email: "team@roasterykreuzberg.example.com",
        phone: "+49 30 5550 3391",
        address: "Gneisenaustraße 42, 10961 Berlin",
        notes: null,
      },
      {
        id: "emma-client-03",
        name: "Hafenkante Boat Tours",
        email: "buero@hafenkante-touren.example.com",
        phone: "+49 40 5550 7612",
        address: "Alter Walfisch 3, 20457 Hamburg",
        notes: null,
      },
      {
        id: "emma-client-04",
        name: "Isar View Hotels",
        email: "finance@isarviewhotels.example.org",
        phone: "+49 89 5550 9028",
        address: "Haidenauplatz 4, 81667 München",
        notes: "Chain of four hotels; annual photo refresh.",
      },
      {
        id: "emma-client-05",
        name: "Green Garden Supplies",
        email: "rechnung@greengardenbedarf.example.org",
        phone: "+49 30 5550 5573",
        address: "Schloßstraße 96, 12161 Berlin",
        notes: null,
      },
    ],
    // 10 invoices total: with 6 month-covering PAID and 2 future SENT,
    // this account gets one overdue and one draft instead of two each.
    paidMonths: [0, 1, 2, 3, 4, 5],
    overdueSent: 1,
    futureSent: 2,
    draft: 1,
    paidDays: [11, 6, 20, 9, 15, 23],
    itemPool: [
      { description: "Wedding photography package", unitPriceCents: 185000 },
      { description: "Portrait session (per hour)", unitPriceCents: 12000 },
      { description: "Product photography (per item)", unitPriceCents: 3500 },
      { description: "Event coverage (half day)", unitPriceCents: 65000 },
      { description: "Photo retouching (per image)", unitPriceCents: 2500 },
      { description: "Premium photo album", unitPriceCents: 95000 },
      { description: "Real estate photography set", unitPriceCents: 45000 },
      { description: "Studio day", unitPriceCents: 38000 },
      { description: "Framed print set", unitPriceCents: 22000 },
      { description: "Photography consultation", unitPriceCents: 8000 },
    ],
    notesPool: [
      "Includes edited images delivered in a private online gallery.",
      "Second shooters not included in this package.",
      "Travel within Berlin included; beyond that billed at cost.",
      "Umsatzsteuer von 19 % enthalten.",
    ],
  },
  {
    email: "david@example.com",
    idPrefix: "david",
    profile: {
      businessName: "David Miller Consulting",
      address: "24 Rood Lane\nLondon EC3N 2DY\nUnited Kingdom",
      logoUrl: null,
      currency: "GBP",
      defaultTaxPercent: 20,
      paymentInstructions:
        "Payment by BACS transfer within the terms on the invoice. Please quote the invoice number in the payment reference.",
    },
    clients: [
      {
        id: "david-client-01",
        name: "Thameside Property Group",
        email: "ap@thamesideproperty.example.com",
        phone: "+44 20 7946 0312",
        address: "18 Tooley Street, London SE1 2SU",
        notes: "Quarterly advisory retainer.",
      },
      {
        id: "david-client-02",
        name: "Northern Byte Software",
        email: "finance@northernbyte.example.org",
        phone: "+44 161 496 0215",
        address: "1 Barbirolli Boulevard, Manchester M2 3DB",
        notes: null,
      },
      {
        id: "david-client-03",
        name: "Cornish Coastal Cafes",
        email: "owner@cornishcoastalcafes.example.org",
        phone: "+44 1736 495 021",
        address: "21 Quay Hill, Penzance TR18 2QB",
        notes: null,
      },
      {
        id: "david-client-04",
        name: "Fairhaven Wealth",
        email: "operations@fairhavenwealth.example.com",
        phone: "+44 20 7946 0588",
        address: "64 Bastwick Street, London EC1V 3AL",
        notes: null,
      },
      {
        id: "david-client-05",
        name: "Peak Wellness Clubs",
        email: "accounts@peakwellness.example.org",
        phone: "+44 113 496 0119",
        address: "4 Wellington Row, Leeds LS1 4JR",
        notes: "Nine-club group; one invoice per quarter.",
      },
      {
        id: "david-client-06",
        name: "Severn Side Logistics",
        email: "billing@severnsidelogistics.example.com",
        phone: "+44 117 496 0744",
        address: "1 Baltic Wharf, Bristol BS1 6YD",
        notes: null,
      },
      {
        id: "david-client-07",
        name: "Willowmere Events",
        email: "hello@willowmereevents.example.org",
        phone: "+44 121 496 0833",
        address: "61 Temple Row, Birmingham B2 5LS",
        notes: null,
      },
    ],
    paidMonths: [0, 1, 2, 3, 4, 5, 5, 4, 3],
    overdueSent: 3,
    futureSent: 4,
    draft: 2,
    paidDays: [9, 3, 16, 7, 21, 12, 5, 18, 10],
    itemPool: [
      { description: "Management consulting (per day)", unitPriceCents: 125000 },
      { description: "Advisory retainer (per month)", unitPriceCents: 350000 },
      { description: "Team workshop (per day)", unitPriceCents: 95000 },
      { description: "Market research project", unitPriceCents: 850000 },
      { description: "Due diligence (per hour)", unitPriceCents: 15000 },
      { description: "Fractional operations lead (per week)", unitPriceCents: 600000 },
      { description: "Executive coaching session", unitPriceCents: 45000 },
      { description: "Process audit", unitPriceCents: 480000 },
      { description: "Investor deck support", unitPriceCents: 275000 },
      { description: "Onboarding pack", unitPriceCents: 90000 },
    ],
    notesPool: [
      "Engagement letter dated at issue; expenses billed separately.",
      "VAT charged at the standard rate.",
      "Deliverables shared in the client workspace.",
      "Second day of the workshop at the reduced group rate.",
    ],
  },
  {
    email: "priya@example.com",
    idPrefix: "priya",
    profile: {
      businessName: "Priya Design Studio",
      address:
        "6th Floor, Empire One, Koregaon Park\nPune, Maharashtra 411001\nIndia",
      logoUrl: null,
      currency: "INR",
      defaultTaxPercent: 18,
      paymentInstructions:
        "Payment via UPI or NEFT to the account details on file. GST invoice; please quote the invoice number with your payment.",
    },
    clients: [
      {
        id: "priya-client-01",
        name: "Curry Leaf Catering",
        email: "hello@curryleafcatering.example.com",
        phone: "+91 98220 41156",
        address: "North Main Road, Koregaon Park, Pune 411001",
        notes: null,
      },
      {
        id: "priya-client-02",
        name: "Paper Crane Books",
        email: "store@papercranebooks.example.org",
        phone: "+91 98670 33214",
        address: "Linking Road, Bandra West, Mumbai 400050",
        notes: null,
      },
      {
        id: "priya-client-03",
        name: "Urban Nest Realty",
        email: "marketing@urbannestrealty.example.com",
        phone: "+91 99300 77512",
        address: "Bandra Kurla Complex, Mumbai 400051",
        notes: "Rebrands launched across all projects this year.",
      },
      {
        id: "priya-client-04",
        name: "Zenith Fitness Chain",
        email: "accounts@zenithfitness.example.org",
        phone: "+91 98111 60237",
        address: "FC Road, Shivajinagar, Pune 411005",
        notes: null,
      },
      {
        id: "priya-client-05",
        name: "Bloom & Petal Florists",
        email: "orders@bloomandpetal.example.org",
        phone: "+91 98920 18845",
        address: "S.V. Road, Borivali West, Mumbai 400092",
        notes: null,
      },
      {
        id: "priya-client-06",
        name: "Tide & Barrel Brewing",
        email: "finance@tideandbarrel.example.com",
        phone: "+91 90210 55938",
        address: "Hadapsar Industrial Estate, Pune 411013",
        notes: "Label approvals require the food-license number.",
      },
      {
        id: "priya-client-07",
        name: "Rangmanch Theatre Co",
        email: "boxoffice@rangmanchtheatre.example.org",
        phone: "+91 91580 22160",
        address: "JM Road, Camp, Pune 411001",
        notes: null,
      },
      {
        id: "priya-client-08",
        name: "Silver Line Jewels",
        email: "admin@silverlinejewels.example.com",
        phone: "+91 98200 91473",
        address: "Zaveri Bazaar, Mumbai 400003",
        notes: null,
      },
    ],
    paidMonths: [0, 1, 2, 3, 4, 5, 5, 4, 3, 0],
    overdueSent: 3,
    futureSent: 5,
    draft: 2,
    paidDays: [8, 3, 15, 6, 20, 11, 4, 17, 9, 24],
    itemPool: [
      { description: "Logo design (concept set)", unitPriceCents: 4500000 },
      { description: "Brand guidelines document", unitPriceCents: 35000000 },
      { description: "Packaging design (per SKU)", unitPriceCents: 6500000 },
      { description: "Product UI kit", unitPriceCents: 55000000 },
      { description: "Social media template suite", unitPriceCents: 9000000 },
      { description: "Custom illustration (per piece)", unitPriceCents: 1800000 },
      { description: "Motion explainer video", unitPriceCents: 12000000 },
      { description: "Poster series design", unitPriceCents: 800000 },
      { description: "Print collateral design", unitPriceCents: 1500000 },
      { description: "Exhibition stall design", unitPriceCents: 20000000 },
    ],
    notesPool: [
      "Design brief signed off before production started.",
      "Source files handed over after full payment.",
      "Includes a print-ready and a digital variant.",
      "GST invoiced at 18%; e-invoice generated.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Date helpers (shared by the hand-written and generated accounts).
// ---------------------------------------------------------------------------

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

function materializeSpec(
  spec: InvoiceSpec,
  window: string[],
  currentKey: string,
  now: Date
): SeedInvoice {
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
  };
}

// ---------------------------------------------------------------------------
// Deterministic spec generator for the plan-based accounts.
// ---------------------------------------------------------------------------

// Per-kind offset pools; every (issueDaysAgo, dueDaysOffset) pair keeps
// issueDate <= dueDate, and negative offsets land SENT due dates clearly
// past the overdue cutoff.
const OVERDUE_OFFSETS = [
  { issueDaysAgo: 60, dueDaysOffset: -45 },
  { issueDaysAgo: 90, dueDaysOffset: -75 },
  { issueDaysAgo: 45, dueDaysOffset: -30 },
  { issueDaysAgo: 110, dueDaysOffset: -90 },
];
const FUTURE_OFFSETS = [
  { issueDaysAgo: 5, dueDaysOffset: 20 },
  { issueDaysAgo: 2, dueDaysOffset: 30 },
  { issueDaysAgo: 8, dueDaysOffset: 45 },
  { issueDaysAgo: 1, dueDaysOffset: 15 },
];
const DRAFT_OFFSETS = [
  { issueDaysAgo: 3, dueDaysOffset: 14 },
  { issueDaysAgo: 0, dueDaysOffset: 30 },
  { issueDaysAgo: 5, dueDaysOffset: 21 },
  { issueDaysAgo: 1, dueDaysOffset: 45 },
];

const ITEM_COUNTS = [2, 3, 2, 4];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildPlanSpecs(plan: AccountPlan): InvoiceSpec[] {
  const paidCount = plan.paidMonths.length;
  const total =
    paidCount + plan.overdueSent + plan.futureSent + plan.draft;

  const specs: InvoiceSpec[] = [];

  for (let i = 0; i < total; i += 1) {
    const clientKey = `${plan.idPrefix}-client-${pad2((i % plan.clients.length) + 1)}`;
    const itemCount = ITEM_COUNTS[i % ITEM_COUNTS.length];
    // Start at (i*3) mod 10 and step by 3: 3 is coprime with the pool
    // size, so the picks within one invoice are always distinct.
    const start = (i * 3) % plan.itemPool.length;

    const items = Array.from(
      { length: itemCount },
      (_, k) => plan.itemPool[(start + k * 3) % plan.itemPool.length]
    ).map((entry, k) => ({
      description: entry.description,
      quantity: 1 + ((i * 2 + k) % 3),
      unitPriceCents: entry.unitPriceCents,
    }));

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );

    const taxPercent =
      plan.taxVariation && i % 5 === 3
        ? 0
        : plan.profile.defaultTaxPercent;

    // Roughly every third invoice carries a ~10% discount, floored to
    // whole currency units so it can never exceed the subtotal.
    const discountCents =
      i % 3 === 2 ? Math.floor(subtotalCents / 1000) * 100 : 0;

    const notes =
      i % 3 === 1 ? plan.notesPool[i % plan.notesPool.length] : null;

    const number = `INV-${String(i + 1).padStart(4, "0")}`;

    if (i < paidCount) {
      specs.push({
        number,
        clientKey,
        status: "PAID",
        monthIndex: plan.paidMonths[i],
        paidDay: plan.paidDays[i % plan.paidDays.length],
        taxPercent,
        discountCents,
        notes,
        items,
      });
    } else if (i < paidCount + plan.overdueSent) {
      const offset =
        OVERDUE_OFFSETS[(i - paidCount) % OVERDUE_OFFSETS.length];

      specs.push({
        number,
        clientKey,
        status: "SENT",
        issueDaysAgo: offset.issueDaysAgo,
        dueDaysOffset: offset.dueDaysOffset,
        taxPercent,
        discountCents,
        notes,
        items,
      });
    } else if (i < paidCount + plan.overdueSent + plan.futureSent) {
      const offset =
        FUTURE_OFFSETS[
          (i - paidCount - plan.overdueSent) % FUTURE_OFFSETS.length
        ];

      specs.push({
        number,
        clientKey,
        status: "SENT",
        issueDaysAgo: offset.issueDaysAgo,
        dueDaysOffset: offset.dueDaysOffset,
        taxPercent,
        discountCents,
        notes,
        items,
      });
    } else {
      const offset =
        DRAFT_OFFSETS[
          (i - paidCount - plan.overdueSent - plan.futureSent) %
            DRAFT_OFFSETS.length
        ];

      specs.push({
        number,
        clientKey,
        status: "DRAFT",
        issueDaysAgo: offset.issueDaysAgo,
        dueDaysOffset: offset.dueDaysOffset,
        taxPercent,
        discountCents,
        notes,
        items,
      });
    }
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Public builder.
// ---------------------------------------------------------------------------

export function buildSeedData(now: Date = new Date()): SeedData {
  const window = buildMonthWindow(now, 6);
  const currentKey = window[window.length - 1];

  const demoAccount: SeedAccount = {
    email: "demo@example.com",
    profile: { ...DEMO_PROFILE },
    clients: DEMO_CLIENTS.map((client) => ({ ...client })),
    invoices: DEMO_SPECS.map((spec) =>
      materializeSpec(spec, window, currentKey, now)
    ),
  };

  const generatedAccounts: SeedAccount[] = ACCOUNT_PLANS.map((plan) => ({
    email: plan.email,
    profile: { ...plan.profile },
    clients: plan.clients.map((client) => ({ ...client })),
    invoices: buildPlanSpecs(plan).map((spec) =>
      materializeSpec(spec, window, currentKey, now)
    ),
  }));

  return { accounts: [demoAccount, ...generatedAccounts] };
}

// Rows shaped for the dashboard's bucketing helper, so tests can prove each
// account's seed fills its revenue chart.
export function paidRevenueRows(account: SeedAccount): PaidRevenueRow[] {
  return account.invoices
    .filter((invoice) => invoice.status === "PAID")
    .map((invoice) => ({
      paidAt: invoice.paidAt,
      totalCents: invoice.totalCents,
    }));
}
