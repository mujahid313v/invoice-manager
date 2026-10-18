import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8"
);

let ddlCache;

function generatedDdl() {
  if (ddlCache) return ddlCache;

  const prismaCli = fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url)
  );
  const schemaPath = fileURLToPath(
    new URL("../prisma/schema.prisma", import.meta.url)
  );

  ddlCache = execFileSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      schemaPath,
      "--script",
    ],
    {
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        // The diff is offline; override any real URL so tests can never reach a database.
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      },
    }
  );

  return ddlCache;
}

function ddlTable(name) {
  const ddl = generatedDdl();
  const match = ddl.match(
    new RegExp(`CREATE TABLE "${name}" \\(([\\s\\S]*?)\\n\\);`)
  );
  assert.ok(match, `table ${name} must exist in the generated DDL`);
  return match[1];
}

function model(name) {
  const match = schema.match(
    new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`)
  );
  assert.ok(match, `model ${name} must exist`);
  return match[1];
}

const user = model("User");
const businessProfile = model("BusinessProfile");
const client = model("Client");
const invoice = model("Invoice");
const invoiceItem = model("InvoiceItem");

test("schema contains exactly the five MVP models", () => {
  const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(models, [
    "User",
    "BusinessProfile",
    "Client",
    "Invoice",
    "InvoiceItem",
  ]);
});

test("invoice statuses are DRAFT, SENT and PAID only", () => {
  const match = schema.match(/enum\s+InvoiceStatus\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, "InvoiceStatus enum must exist");
  const values = match[1].trim().split(/\s+/);
  assert.deepEqual(values, ["DRAFT", "SENT", "PAID"]);
});

test("user owns data and has a per-user invoice counter", () => {
  assert.match(user, /email\s+String\s+@unique/);
  assert.match(user, /passwordHash\s+String/);
  assert.match(user, /nextInvoiceNumber\s+Int\s+@default\(1\)/);
  assert.match(user, /businessProfile\s+BusinessProfile\?/);
  assert.match(user, /clients\s+Client\[\]/);
  assert.match(user, /invoices\s+Invoice\[\]/);
});

test("business profile is one per user with currency and default tax", () => {
  assert.match(businessProfile, /userId\s+String\s+@unique/);
  assert.match(businessProfile, /businessName\s+String/);
  assert.match(businessProfile, /currency\s+String\s+@default\("USD"\)\s+@db\.Char\(3\)/);
  assert.match(businessProfile, /defaultTaxPercent\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(5,\s*2\)/);
  assert.match(
    businessProfile,
    /@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/
  );
});

test("client deletion is restricted while invoices exist", () => {
  assert.match(client, /invoices\s+Invoice\[\]/);
  assert.match(invoice, /clientId\s+String\s*\n/);
  assert.match(
    invoice,
    /client\s+Client\s+@relation\(fields:\s*\[clientId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/
  );
  assert.doesNotMatch(schema, /onDelete:\s*SetNull/);
  assert.doesNotMatch(
    schema,
    /client\s+Client\??\s*@relation\([^)]*onDelete:\s*Cascade/
  );
});

test("invoice records payment time and calendar dates only", () => {
  assert.match(invoice, /paidAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/);
  assert.match(invoice, /issueDate\s+DateTime\s+@db\.Date/);
  assert.match(invoice, /dueDate\s+DateTime\s+@db\.Date/);
  assert.doesNotMatch(invoice, /\bsentAt\b/);
  assert.doesNotMatch(invoice, /\bcurrency\b/);
});

test("invoice keeps live business and client data without snapshots", () => {
  for (const field of [
    "businessName",
    "businessAddress",
    "businessLogoUrl",
    "paymentInstructions",
    "clientName",
    "clientEmail",
    "clientPhone",
    "clientAddress",
  ]) {
    assert.doesNotMatch(
      invoice,
      new RegExp(`\\b${field}\\b`),
      `${field} snapshot must not exist on Invoice`
    );
  }
});

test("all monetary amounts are integer cents", () => {
  assert.doesNotMatch(schema, /\bFloat\b/);
  for (const field of [
    "discountCents",
    "subtotalCents",
    "taxCents",
    "totalCents",
  ]) {
    assert.match(
      invoice,
      new RegExp(`\\b${field}\\s+Int\\b`),
      `${field} must be Int cents`
    );
  }
  assert.match(invoiceItem, /unitPriceCents\s+Int\b/);
  assert.doesNotMatch(invoiceItem, /lineTotalCents/);
  assert.match(invoice, /taxPercent\s+Decimal\s+@db\.Decimal\(5,\s*2\)/);
});

test("quantity is an integer count", () => {
  assert.match(invoiceItem, /quantity\s+Int\b/);
  assert.doesNotMatch(invoiceItem, /quantity\s+Decimal/);
});

test("invoice numbers are unique per user", () => {
  assert.match(invoice, /number\s+String/);
  assert.match(invoice, /@@unique\(\[userId,\s*number\]\)/);
});

test("invoice and item indexes support the MVP query paths", () => {
  for (const index of [
    "@@index([clientId])",
    "@@index([userId, status])",
    "@@index([userId, issueDate])",
    "@@index([userId, dueDate])",
  ]) {
    assert.ok(invoice.includes(index), `Invoice must include ${index}`);
  }
  assert.doesNotMatch(invoice, /@@index\(\[userId,\s*clientName\]\)/);
  assert.match(client, /@@index\(\[userId,\s*name\]\)/);
  assert.match(invoiceItem, /@@unique\(\[invoiceId,\s*position\]\)/);
});

test("line items are ordered and cascade with their invoice", () => {
  assert.match(invoiceItem, /position\s+Int/);
  assert.match(invoiceItem, /description\s+String/);
  assert.match(
    invoiceItem,
    /invoice\s+Invoice\s+@relation\(fields:\s*\[invoiceId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/
  );
});

test("generated DDL creates exactly the five MVP tables and status enum", () => {
  const ddl = generatedDdl();

  assert.equal((ddl.match(/^CREATE TABLE /gm) ?? []).length, 5);
  for (const table of [
    "User",
    "BusinessProfile",
    "Client",
    "Invoice",
    "InvoiceItem",
  ]) {
    assert.match(ddl, new RegExp(`CREATE TABLE "${table}" \\(`));
  }
  assert.match(
    ddl,
    /CREATE TYPE "InvoiceStatus" AS ENUM \('DRAFT', 'SENT', 'PAID'\);/
  );
});

test("generated DDL preserves exact monetary, quantity, date and payment types", () => {
  const ddl = generatedDdl();
  const invoiceDdl = ddlTable("Invoice");
  const invoiceItemDdl = ddlTable("InvoiceItem");

  assert.match(ddl, /"nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1/);
  assert.match(ddl, /"discountCents" INTEGER NOT NULL DEFAULT 0/);
  for (const field of [
    "subtotalCents",
    "taxCents",
    "totalCents",
    "unitPriceCents",
  ]) {
    assert.match(
      ddl,
      new RegExp(`"${field}" INTEGER NOT NULL`),
      `${field} must be a required INTEGER column`
    );
  }
  assert.match(ddl, /"taxPercent" DECIMAL\(5,2\) NOT NULL/);
  assert.match(invoiceItemDdl, /"quantity" INTEGER NOT NULL/);
  assert.match(invoiceItemDdl, /"position" INTEGER NOT NULL/);
  assert.doesNotMatch(invoiceItemDdl, /lineTotalCents/);
  assert.match(ddl, /"issueDate" DATE NOT NULL/);
  assert.match(ddl, /"dueDate" DATE NOT NULL/);
  assert.match(invoiceDdl, /"paidAt" TIMESTAMPTZ\(3\),/);
  assert.doesNotMatch(invoiceDdl, /"paidAt" TIMESTAMPTZ\(3\) NOT NULL/);
  assert.doesNotMatch(ddl, /"sentAt"/);
  assert.equal((ddl.match(/"currency" CHAR\(3\) NOT NULL/g) ?? []).length, 1);
  assert.match(invoiceDdl, /"clientId" TEXT NOT NULL/);
  for (const field of [
    "businessName",
    "businessAddress",
    "businessLogoUrl",
    "paymentInstructions",
    "clientName",
    "clientEmail",
    "clientPhone",
    "clientAddress",
  ]) {
    assert.doesNotMatch(
      invoiceDdl,
      new RegExp(`"${field}"`),
      `${field} snapshot column must not exist on Invoice`
    );
  }
  assert.doesNotMatch(ddl, /\b(REAL|DOUBLE PRECISION|FLOAT)\b/);
});

test("generated DDL enforces uniqueness, indexes and delete actions", () => {
  const ddl = generatedDdl();

  assert.equal((ddl.match(/^CREATE UNIQUE INDEX /gm) ?? []).length, 4);
  assert.match(ddl, /CREATE UNIQUE INDEX "User_email_key" ON "User"\("email"\);/);
  assert.match(
    ddl,
    /CREATE UNIQUE INDEX "BusinessProfile_userId_key" ON "BusinessProfile"\("userId"\);/
  );
  assert.match(
    ddl,
    /CREATE UNIQUE INDEX "Invoice_userId_number_key" ON "Invoice"\("userId", "number"\);/
  );
  assert.match(
    ddl,
    /CREATE UNIQUE INDEX "InvoiceItem_invoiceId_position_key" ON "InvoiceItem"\("invoiceId", "position"\);/
  );

  assert.equal((ddl.match(/^CREATE INDEX /gm) ?? []).length, 5);
  for (const index of [
    "Client_userId_name_idx",
    "Invoice_clientId_idx",
    "Invoice_userId_status_idx",
    "Invoice_userId_issueDate_idx",
    "Invoice_userId_dueDate_idx",
  ]) {
    assert.match(ddl, new RegExp(`CREATE INDEX "${index}"`));
  }

  assert.equal((ddl.match(/FOREIGN KEY/g) ?? []).length, 5);
  assert.match(
    ddl,
    /"BusinessProfile_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/
  );
  assert.match(
    ddl,
    /"Client_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/
  );
  assert.match(
    ddl,
    /"Invoice_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/
  );
  assert.match(
    ddl,
    /"Invoice_clientId_fkey" FOREIGN KEY \("clientId"\) REFERENCES "Client"\("id"\) ON DELETE RESTRICT/
  );
  assert.doesNotMatch(
    ddl,
    /"Invoice_clientId_fkey"[^;]*ON DELETE (CASCADE|SET NULL)/
  );
  assert.match(
    ddl,
    /"InvoiceItem_invoiceId_fkey" FOREIGN KEY \("invoiceId"\) REFERENCES "Invoice"\("id"\) ON DELETE CASCADE/
  );
});
