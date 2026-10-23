// Pure view-model for the invoice PDF.
//
// It turns the DB record (invoice + items + client + business profile) into
// ready-to-render strings. No React, no Prisma, no network: the API route
// owns all side effects, and the unit tests can import this module directly.
//
// Money is integer cents until the very last step. The formatter splits
// cents into an integer major part and an integer minor part and assembles
// the final string around them, so no cent is ever lost to float math.

import { effectiveInvoiceStatus } from "./invoice-status.ts";
import {
  formatCentsDisplay,
  normalizeDisplayCurrency,
} from "./money-display.ts";

// The shared currency formatter lives in `@/lib/money-display` so the PDF
// and the dashboard render identical amounts. It is re-exported here
// because this module is its original home.
export {
  formatCentsDisplay,
  normalizeDisplayCurrency as normalizePdfCurrency,
} from "./money-display.ts";

export type InvoicePdfItemRecord = {
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type InvoicePdfRecord = {
  number: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  taxPercent: { toNumber: () => number };
  discountCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  items: InvoicePdfItemRecord[];
  client: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
};

export type InvoicePdfProfile = {
  businessName: string;
  address: string | null;
  currency: string;
  paymentInstructions: string | null;
} | null;

export type InvoicePdfViewModel = {
  filename: string;
  invoiceNumber: string;
  statusText: string;
  issueDateText: string;
  dueDateText: string;
  businessName: string;
  businessAddress: string;
  currency: string;
  client: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  items: Array<{
    description: string;
    quantityText: string;
    unitPriceText: string;
    amountText: string;
  }>;
  subtotalText: string;
  discountText: string | null;
  taxText: string;
  taxPercentLabel: string;
  totalText: string;
  notes: string;
  paymentInstructions: string;
};

function formatDateOnlyUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const DISPLAY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  OVERDUE: "Overdue",
  PAID: "Paid",
};

// The filename is the invoice number, reduced to characters that are safe
// inside Content-Disposition, with a fixed fallback.
export function sanitizeInvoiceFilename(number: string): string {
  const cleaned = number
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^\.+/, "")
    .slice(0, 64);

  return `${cleaned.length > 0 ? cleaned : "invoice"}.pdf`;
}

// The logo is fetched by the server, so the URL is treated as untrusted
// input: https only, and no loopback, private or link-local hosts.
function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);

  if (!match) {
    return false;
  }

  const a = Number(match[1]);
  const b = Number(match[2]);

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isSafeLogoUrl(raw: string | null | undefined): boolean {
  if (!raw) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return false;
  }

  // IPv6 literals arrive wrapped in brackets.
  const bareHost = host.replace(/^\[|\]$/g, "");

  if (bareHost.includes(":")) {
    const v6 = bareHost.toLowerCase();

    // WHATWG normalization rewrites embedded IPv4 into hex (7f00:1), so any
    // zero-compressed leading form (::, ::1, ::ffff:*, ::x) is rejected as
    // loopback/mapped territory, along with unique-local and link-local.
    if (
      v6.startsWith("::") ||
      v6.startsWith("fc") ||
      v6.startsWith("fd") ||
      v6.startsWith("fe80")
    ) {
      return false;
    }

    const embeddedIpv4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6)?.[1];

    if (embeddedIpv4 && isPrivateIpv4(embeddedIpv4)) {
      return false;
    }

    return true;
  }

  return !isPrivateIpv4(bareHost);
}

function taxPercentLabel(value: number): string {
  const hundredths = Math.round(Math.max(0, value) * 100);
  const whole = Math.trunc(hundredths / 100);
  const fraction = hundredths % 100;

  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function buildInvoicePdfViewModel(
  invoice: InvoicePdfRecord,
  profile: InvoicePdfProfile,
  now: Date = new Date()
): InvoicePdfViewModel {
  const currency = normalizeDisplayCurrency(profile?.currency);
  const displayStatus = effectiveInvoiceStatus(invoice, now);

  return {
    filename: sanitizeInvoiceFilename(invoice.number),
    invoiceNumber: invoice.number,
    statusText: DISPLAY_STATUS_LABELS[displayStatus] ?? displayStatus,
    issueDateText: formatDateOnlyUtc(invoice.issueDate),
    dueDateText: formatDateOnlyUtc(invoice.dueDate),
    businessName: profile?.businessName ?? "Invoice",
    businessAddress: profile?.address ?? "",
    currency,
    client: {
      name: invoice.client.name,
      email: invoice.client.email ?? "",
      phone: invoice.client.phone ?? "",
      address: invoice.client.address ?? "",
    },
    items: invoice.items.map((item) => ({
      description: item.description,
      quantityText: String(item.quantity),
      unitPriceText: formatCentsDisplay(item.unitPriceCents, currency),
      amountText: formatCentsDisplay(
        item.quantity * item.unitPriceCents,
        currency
      ),
    })),
    subtotalText: formatCentsDisplay(invoice.subtotalCents, currency),
    discountText:
      invoice.discountCents > 0
        ? formatCentsDisplay(invoice.discountCents, currency)
        : null,
    taxText: formatCentsDisplay(invoice.taxCents, currency),
    taxPercentLabel: taxPercentLabel(invoice.taxPercent.toNumber()),
    totalText: formatCentsDisplay(invoice.totalCents, currency),
    notes: invoice.notes ?? "",
    paymentInstructions: profile?.paymentInstructions ?? "",
  };
}
