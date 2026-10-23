import test from "node:test";
import assert from "node:assert/strict";

const {
  buildInvoicePdfViewModel,
  formatCentsDisplay,
  isSafeLogoUrl,
  normalizePdfCurrency,
  sanitizeInvoiceFilename,
} = await import("../src/lib/invoice-pdf-data.ts");

const NOW = new Date("2026-10-20T12:00:00.000Z");

function invoiceRecord(overrides = {}) {
  return {
    number: "INV-0007",
    status: "DRAFT",
    issueDate: new Date("2026-10-01T00:00:00.000Z"),
    dueDate: new Date("2026-10-15T00:00:00.000Z"),
    taxPercent: { toNumber: () => 8.25 },
    discountCents: 0,
    subtotalCents: 1002,
    taxCents: 83,
    totalCents: 1085,
    notes: null,
    items: [
      { description: "Consulting", quantity: 3, unitPriceCents: 334 },
    ],
    client: {
      name: "Alpha",
      email: "alpha@example.com",
      phone: null,
      address: "1 Main Street",
    },
    ...overrides,
  };
}

const profile = {
  businessName: "Acme Studio",
  address: "42 Market Rd",
  currency: "USD",
  paymentInstructions: "IBAN US12 3456",
};

test("cents format without float drift and with grouping", () => {
  assert.equal(formatCentsDisplay(7, "USD"), "$0.07");
  assert.equal(formatCentsDisplay(19950, "USD"), "$199.50");
  assert.equal(formatCentsDisplay(100000001, "USD"), "$1,000,000.01");
  assert.equal(formatCentsDisplay(0, "USD"), "$0.00");
  assert.equal(formatCentsDisplay(1234567890, "USD"), "$12,345,678.90");
  // Values whose naive cents/100 float is not exact still format exactly.
  assert.equal(formatCentsDisplay(333333333, "USD"), "$3,333,333.33");
});

test("currency symbols follow the profile and invalid codes fall back to USD", () => {
  assert.equal(formatCentsDisplay(100000, "INR"), "₹1,000.00");
  assert.equal(formatCentsDisplay(100000, "EUR"), "€1,000.00");
  assert.equal(normalizePdfCurrency("usd"), "USD");
  assert.equal(normalizePdfCurrency("R$"), "USD");
  assert.equal(normalizePdfCurrency(null), "USD");
  assert.equal(normalizePdfCurrency("XX!" ), "USD");
  // Well-formed three-letter codes are passed through: Intl only checks the
  // shape, and the business profile schema already restricts currency to an
  // uppercase three-letter code.
  assert.equal(normalizePdfCurrency("ZZZ"), "ZZZ");
  assert.match(formatCentsDisplay(100000, "ZZZ"), /1,000\.00$/);
  assert.equal(formatCentsDisplay(100000, "ZZZ!"), "$1,000.00");
});

test("negative or fractional cents are rejected, never rounded silently", () => {
  assert.throws(() => formatCentsDisplay(-1, "USD"), RangeError);
  assert.throws(() => formatCentsDisplay(10.5, "USD"), RangeError);
  assert.throws(
    () => formatCentsDisplay(Number.MAX_SAFE_INTEGER + 10, "USD"),
    RangeError
  );
});

test("the view model carries totals to the cent including discount and tax", () => {
  const model = buildInvoicePdfViewModel(
    invoiceRecord({
      subtotalCents: 43598,
      discountCents: 500,
      taxCents: 4310,
      totalCents: 47408,
      taxPercent: { toNumber: () => 10 },
      discount: undefined,
    }),
    profile,
    NOW
  );

  assert.equal(model.subtotalText, "$435.98");
  assert.equal(model.discountText, "$5.00");
  assert.equal(model.taxText, "$43.10");
  assert.equal(model.totalText, "$474.08");
  assert.equal(model.taxPercentLabel, "10");
});

test("the discount row is hidden when the discount is zero", () => {
  const model = buildInvoicePdfViewModel(invoiceRecord(), profile, NOW);

  assert.equal(model.discountText, null);
});

test("tax percent labels keep at most two decimals without trailing zeros", () => {
  const label = (percent) =>
    buildInvoicePdfViewModel(
      invoiceRecord({ taxPercent: { toNumber: () => percent } }),
      profile,
      NOW
    ).taxPercentLabel;

  assert.equal(label(8.25), "8.25");
  assert.equal(label(10), "10");
  assert.equal(label(0), "0");
  assert.equal(label(0.1), "0.10");
});

test("status mapping: Paid stays Paid, Sent past due is Overdue", () => {
  const base = { dueDate: new Date("2026-10-15T00:00:00.000Z") };

  assert.equal(
    buildInvoicePdfViewModel(
      invoiceRecord({ ...base, status: "PAID" }),
      profile,
      NOW
    ).statusText,
    "Paid"
  );
  assert.equal(
    buildInvoicePdfViewModel(
      invoiceRecord({ ...base, status: "SENT" }),
      profile,
      NOW
    ).statusText,
    "Overdue"
  );
  assert.equal(
    buildInvoicePdfViewModel(
      invoiceRecord({
        ...base,
        status: "SENT",
        dueDate: new Date("2026-10-25T00:00:00.000Z"),
      }),
      profile,
      NOW
    ).statusText,
    "Sent"
  );
  assert.equal(
    buildInvoicePdfViewModel(invoiceRecord({ status: "DRAFT" }), profile, NOW)
      .statusText,
    "Draft"
  );
});

test("the filename is the sanitized invoice number with .pdf", () => {
  assert.equal(sanitizeInvoiceFilename("INV-0007"), "INV-0007.pdf");
  assert.equal(
    sanitizeInvoiceFilename('INV/0007";..exec'),
    "INV0007..exec.pdf"
  );
  assert.equal(sanitizeInvoiceFilename("😀😀"), "invoice.pdf");
  assert.equal(sanitizeInvoiceFilename("../../etc/passwd"), "etcpasswd.pdf");
  assert.equal(
    sanitizeInvoiceFilename("INV-0007").startsWith("INV-0007"),
    true
  );

  const model = buildInvoicePdfViewModel(
    invoiceRecord({ number: "BAD\"NAME\r\nX" }),
    profile,
    NOW
  );

  assert.equal(model.filename, "BADNAMEX.pdf");
});

test("dates are formatted UTC-safe and strings are pre-rendered", () => {
  const model = buildInvoicePdfViewModel(invoiceRecord(), profile, NOW);

  assert.equal(model.issueDateText, "2026-10-01");
  assert.equal(model.dueDateText, "2026-10-15");
  assert.equal(model.items[0].quantityText, "3");
  assert.equal(model.items[0].unitPriceText, "$3.34");
  assert.equal(model.items[0].amountText, "$10.02");
  assert.equal(model.notes, "");
  assert.equal(model.paymentInstructions, "IBAN US12 3456");
  assert.equal(model.client.phone, "");
});

test("a missing profile falls back to USD without crashing", () => {
  const model = buildInvoicePdfViewModel(invoiceRecord(), null, NOW);

  assert.equal(model.currency, "USD");
  assert.equal(model.totalText, "$10.85");
  assert.equal(model.businessName, "Invoice");
  assert.equal(model.paymentInstructions, "");
});

test("logo URLs: https public hosts pass, everything else is rejected", () => {
  assert.equal(isSafeLogoUrl("https://cdn.example.com/logo.png"), true);

  for (const bad of [
    null,
    undefined,
    "",
    "http://cdn.example.com/logo.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "//cdn.example.com/logo.png",
    "ftp://cdn.example.com/logo.png",
    "https://localhost/logo.png",
    "https://app.localhost/logo.png",
    "https://127.0.0.1/logo.png",
    "https://0.0.0.0/logo.png",
    "https://10.1.2.3/logo.png",
    "https://172.16.0.1/logo.png",
    "https://172.31.255.255/logo.png",
    "https://192.168.1.10/logo.png",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/logo.png",
    "https://[::1]/logo.png",
    "https://[::]/logo.png",
    "https://[fe80::1]/logo.png",
    "https://[fd12::34]/logo.png",
    "https://[::ffff:127.0.0.1]/logo.png",
    "https://x.internal/logo.png",
    "not a url",
  ]) {
    assert.equal(
      isSafeLogoUrl(bad),
      false,
      `${JSON.stringify(bad)} must be rejected`
    );
  }
});
