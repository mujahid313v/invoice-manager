import test from "node:test";
import assert from "node:assert/strict";

const { businessProfileSchema } = await import("../src/lib/validation.ts");

const validProfile = {
  businessName: "Acme Studio",
  address: "123 Main Street",
  logoUrl: "https://example.com/logo.png",
  currency: "USD",
  defaultTaxPercent: 8.25,
  paymentInstructions: "Pay within 14 days.",
};

test("business profile accepts and normalizes a complete payload", () => {
  const result = businessProfileSchema.safeParse({
    ...validProfile,
    businessName: "  Acme Studio  ",
    address: "  123 Main Street  ",
    currency: "usd",
    paymentInstructions: "  Pay within 14 days.  ",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.deepEqual(result.data, {
      ...validProfile,
      address: "123 Main Street",
      paymentInstructions: "Pay within 14 days.",
    });
  }
});

test("optional profile fields default to null and currency to USD", () => {
  const result = businessProfileSchema.safeParse({
    businessName: "Acme Studio",
    defaultTaxPercent: 0,
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.deepEqual(result.data, {
      businessName: "Acme Studio",
      address: null,
      logoUrl: null,
      currency: "USD",
      defaultTaxPercent: 0,
      paymentInstructions: null,
    });
  }

  const blank = businessProfileSchema.safeParse({
    businessName: "Acme Studio",
    defaultTaxPercent: 0,
    address: "   ",
    logoUrl: null,
    paymentInstructions: "",
  });

  assert.equal(blank.success, true);

  if (blank.success) {
    assert.equal(blank.data.address, null);
    assert.equal(blank.data.logoUrl, null);
    assert.equal(blank.data.paymentInstructions, null);
  }
});

test("business name is required and trimmed", () => {
  for (const businessName of [undefined, "", "   "]) {
    assert.equal(
      businessProfileSchema.safeParse({
        businessName,
        defaultTaxPercent: 0,
      }).success,
      false,
      `businessName ${JSON.stringify(businessName)} must be rejected`
    );
  }

  const result = businessProfileSchema.safeParse({
    businessName: "  Acme Studio  ",
    defaultTaxPercent: 0,
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.businessName, "Acme Studio");
  }
});

test("default tax is limited to 0-100 with at most two decimals", () => {
  for (const defaultTaxPercent of [0, 5.5, 7.23, 99.99, 100]) {
    assert.equal(
      businessProfileSchema.safeParse({
        businessName: "Acme Studio",
        defaultTaxPercent,
      }).success,
      true,
      `${defaultTaxPercent} must be accepted`
    );
  }

  for (const defaultTaxPercent of [
    -0.01,
    100.01,
    7.555,
    99.999,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "10",
    undefined,
  ]) {
    assert.equal(
      businessProfileSchema.safeParse({
        businessName: "Acme Studio",
        defaultTaxPercent,
      }).success,
      false,
      `${String(defaultTaxPercent)} must be rejected`
    );
  }
});

test("unknown profile fields are rejected", () => {
  for (const extra of [
    { userId: "attacker" },
    { id: "profile_123" },
    { createdAt: "2026-10-19T00:00:00.000Z" },
    { extra: true },
  ]) {
    const result = businessProfileSchema.safeParse({
      ...validProfile,
      ...extra,
    });

    assert.equal(result.success, false);

    if (!result.success) {
      assert.ok(
        result.error.issues.some((issue) =>
          /unrecognized/i.test(issue.message)
        ),
        "unrecognized key issue must be reported"
      );
    }
  }
});

test("currency normalizes to an uppercase three-letter code", () => {
  for (const [input, expected] of [
    ["usd", "USD"],
    [" eur ", "EUR"],
    ["gbp", "GBP"],
  ]) {
    const result = businessProfileSchema.safeParse({
      businessName: "Acme Studio",
      defaultTaxPercent: 0,
      currency: input,
    });

    assert.equal(result.success, true);

    if (result.success) {
      assert.equal(result.data.currency, expected);
    }
  }

  for (const currency of ["US", "USDD", "12A", "U$D", ""]) {
    assert.equal(
      businessProfileSchema.safeParse({
        businessName: "Acme Studio",
        defaultTaxPercent: 0,
        currency,
      }).success,
      false,
      `${JSON.stringify(currency)} must be rejected`
    );
  }
});

test("profile text fields enforce length limits", () => {
  assert.equal(
    businessProfileSchema.safeParse({
      businessName: "a".repeat(200),
      defaultTaxPercent: 0,
    }).success,
    true
  );
  assert.equal(
    businessProfileSchema.safeParse({
      businessName: "a".repeat(201),
      defaultTaxPercent: 0,
    }).success,
    false
  );
  assert.equal(
    businessProfileSchema.safeParse({
      ...validProfile,
      address: "a".repeat(501),
    }).success,
    false
  );
  assert.equal(
    businessProfileSchema.safeParse({
      ...validProfile,
      logoUrl: "a".repeat(2049),
    }).success,
    false
  );
  assert.equal(
    businessProfileSchema.safeParse({
      ...validProfile,
      paymentInstructions: "a".repeat(2001),
    }).success,
    false
  );
});
