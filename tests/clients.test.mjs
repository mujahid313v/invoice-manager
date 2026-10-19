import test from "node:test";
import assert from "node:assert/strict";

const { clientSchema } = await import("../src/lib/validation.ts");
const { clientListWhere } = await import("../src/lib/clients.ts");
const { isClientInvoiceDeleteConflict } = await import(
  "../src/lib/prisma-errors.ts"
);

const validClient = {
  name: "Acme Corp",
  email: "billing@acme.com",
  phone: "+1 555 0100",
  address: "1 Main Street",
  notes: "Net 30",
};

test("client accepts and normalizes a complete payload", () => {
  const result = clientSchema.safeParse({
    ...validClient,
    name: "  Acme Corp  ",
    email: "  BILLING@ACME.COM ",
    phone: "  +1 555 0100  ",
    address: "  1 Main Street  ",
    notes: "  Net 30  ",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.deepEqual(result.data, {
      ...validClient,
      name: "Acme Corp",
      email: "billing@acme.com",
      phone: "+1 555 0100",
      address: "1 Main Street",
      notes: "Net 30",
    });
  }
});

test("optional client fields default to null", () => {
  const result = clientSchema.safeParse({ name: "Acme Corp" });

  assert.equal(result.success, true);

  if (result.success) {
    assert.deepEqual(result.data, {
      name: "Acme Corp",
      email: null,
      phone: null,
      address: null,
      notes: null,
    });
  }
});

test("blank optional client fields become null", () => {
  const result = clientSchema.safeParse({
    name: "Acme Corp",
    email: "   ",
    phone: "",
    address: "   ",
    notes: "",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.email, null);
    assert.equal(result.data.phone, null);
    assert.equal(result.data.address, null);
    assert.equal(result.data.notes, null);
  }
});

test("client name is required and trimmed", () => {
  for (const name of [undefined, null, "", "   ", 42]) {
    assert.equal(
      clientSchema.safeParse({ name }).success,
      false,
      `name ${JSON.stringify(name)} must be rejected`
    );
  }

  const result = clientSchema.safeParse({ name: "  Acme Corp  " });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.name, "Acme Corp");
  }
});

test("client email is optional but must be valid when provided", () => {
  for (const email of ["not-an-email", "missing-at-sign", "a@", "@example"]) {
    const result = clientSchema.safeParse({ name: "Acme Corp", email });

    assert.equal(
      result.success,
      false,
      `${JSON.stringify(email)} must be rejected`
    );

    if (!result.success) {
      assert.ok(
        result.error.issues.some((issue) => issue.path[0] === "email"),
        "email issue must be reported"
      );
    }
  }

  for (const email of [undefined, null, "", "  billing@acme.com  "]) {
    assert.equal(
      clientSchema.safeParse({ name: "Acme Corp", email }).success,
      true,
      `${JSON.stringify(email)} must be accepted`
    );
  }
});

test("unknown client fields are rejected", () => {
  for (const extra of [
    { userId: "attacker" },
    { id: "client_123" },
    { createdAt: "2026-10-19T00:00:00.000Z" },
    { extra: true },
  ]) {
    const result = clientSchema.safeParse({
      ...validClient,
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

test("client text fields enforce consistent length limits", () => {
  assert.equal(
    clientSchema.safeParse({ name: "a".repeat(200) }).success,
    true
  );
  assert.equal(
    clientSchema.safeParse({ name: "a".repeat(201) }).success,
    false
  );
  assert.equal(
    clientSchema.safeParse({
      name: "Acme Corp",
      phone: "a".repeat(50),
    }).success,
    true
  );
  assert.equal(
    clientSchema.safeParse({
      name: "Acme Corp",
      phone: "a".repeat(51),
    }).success,
    false
  );
  assert.equal(
    clientSchema.safeParse({
      name: "Acme Corp",
      address: "a".repeat(500),
    }).success,
    true
  );
  assert.equal(
    clientSchema.safeParse({
      name: "Acme Corp",
      address: "a".repeat(501),
    }).success,
    false
  );
  assert.equal(
    clientSchema.safeParse({
      name: "Acme Corp",
      notes: "a".repeat(2000),
    }).success,
    true
  );
  assert.equal(
    clientSchema.safeParse({
      name: "Acme Corp",
      notes: "a".repeat(2001),
    }).success,
    false
  );
});

test("client search where always scopes to the owner", () => {
  assert.deepEqual(clientListWhere("user_123", ""), { userId: "user_123" });
  assert.deepEqual(clientListWhere("user_123", "   "), {
    userId: "user_123",
  });
  assert.deepEqual(clientListWhere("user_123", null), { userId: "user_123" });
  assert.deepEqual(clientListWhere("user_123", undefined), {
    userId: "user_123",
  });
});

test("client search matches name and email case-insensitively", () => {
  const where = clientListWhere("user_123", "  ACME  ");

  assert.equal(where.userId, "user_123");
  assert.deepEqual(where.OR, [
    { name: { contains: "ACME", mode: "insensitive" } },
    { email: { contains: "ACME", mode: "insensitive" } },
  ]);
});

test("only the invoice foreign-key restriction is a delete conflict", () => {
  const invoiceRestriction = new Error(
    'Error occurred during query execution: PostgresError { code: "23001", ' +
      'message: "update or delete on table \\"Client\\" violates RESTRICT ' +
      'setting of foreign key constraint \\"Invoice_clientId_fkey\\" on ' +
      'table \\"Invoice\\"" }'
  );

  assert.equal(isClientInvoiceDeleteConflict(invoiceRestriction), true);
  assert.equal(
    isClientInvoiceDeleteConflict(
      new Error('PostgresError { code: "23001", message: "other restriction" }')
    ),
    false
  );
  assert.equal(
    isClientInvoiceDeleteConflict(new Error("Connection refused")),
    false
  );
  assert.equal(isClientInvoiceDeleteConflict(null), false);
  assert.equal(isClientInvoiceDeleteConflict(undefined), false);
});
