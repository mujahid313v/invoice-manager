import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const enabled = process.env.RUN_INVOICE_PDF_TESTS === "1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomIp() {
  return `203.0.113.${randomInt(2, 254)}`;
}

function getSessionCookie(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const raw = cookies.length
    ? cookies
    : [response.headers.get("set-cookie")].filter(Boolean);
  const session = raw.find((cookie) => cookie.startsWith("session="));

  assert.ok(session, "registration must set a session cookie");

  return session.split(";")[0];
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function assertErrorBody(body) {
  assert.equal(typeof body?.error, "string");
  assert.ok(body.error.length > 0, "error message must not be empty");
}

async function startServer() {
  const externalBaseUrl = process.env.INVOICE_PDF_BASE_URL;

  if (externalBaseUrl) {
    return {
      baseUrl: externalBaseUrl.replace(/\/$/, ""),
      stop: async () => {},
    };
  }

  if (!existsSync(join(process.cwd(), ".next", "BUILD_ID"))) {
    throw new Error(
      "Production build missing. Run `npm run build` before the PDF tests."
    );
  }

  const port = Number(process.env.INVOICE_PDF_PORT ?? randomInt(5400, 6400));
  const nextBin = join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    }
  );

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `next start exited with code ${child.exitCode} before becoming ready`
      );
    }

    try {
      const response = await fetch(`${baseUrl}/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });

      if (response.status === 200) {
        return {
          baseUrl,
          stop: async () => {
            if (child.exitCode !== null) {
              return;
            }

            const exited = new Promise((resolve) => {
              child.once("exit", resolve);
            });
            child.kill();
            await Promise.race([exited, sleep(3_000)]);

            if (child.exitCode === null) {
              child.kill("SIGKILL");
            }
          },
        };
      }
    } catch {
      // Server is still starting.
    }

    await sleep(250);
  }

  child.kill("SIGKILL");
  throw new Error("next start did not become ready within 30 seconds");
}

test(
  "invoice PDF API integration",
  {
    skip: enabled
      ? false
      : "Set RUN_INVOICE_PDF_TESTS=1 with .env loaded to run live PDF tests.",
    timeout: 240_000,
  },
  async (t) => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be loaded (use node --env-file=.env)."
      );
    }

    const sql = neon(process.env.DATABASE_URL);
    const server = await startServer();
    const createdUsers = [];

    t.after(async () => {
      let cleanupError = null;

      try {
        for (const user of createdUsers) {
          const rows = await sql`
            SELECT id, email FROM "User" WHERE id = ${user.id}
          `;

          if (rows.length === 0) {
            continue;
          }

          assert.equal(rows[0].email, user.email);
          assert.match(user.email, /^issue7-api-/);

          await sql`
            DELETE FROM "InvoiceItem"
            WHERE "invoiceId" IN (
              SELECT id FROM "Invoice" WHERE "userId" = ${user.id}
            )
          `;
          await sql`DELETE FROM "Invoice" WHERE "userId" = ${user.id}`;
          await sql`DELETE FROM "BusinessProfile" WHERE "userId" = ${user.id}`;
          await sql`DELETE FROM "Client" WHERE "userId" = ${user.id}`;
          await sql`
            DELETE FROM "User" WHERE id = ${user.id} AND email = ${user.email}
          `;
        }
      } catch (error) {
        cleanupError = error;
      }

      await server.stop();

      if (cleanupError) {
        throw cleanupError;
      }
    });

    async function register(label) {
      const email = `issue7-api-${label}-${Date.now()}-${randomUUID().slice(
        0,
        8
      )}@example.com`;
      const response = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": randomIp(),
        },
        body: JSON.stringify({
          email,
          password: `Test-${randomUUID()}`,
        }),
      });
      const body = await readJson(response);

      assert.equal(response.status, 201);

      createdUsers.push({ id: body.user.id, email });

      return { id: body.user.id, email, cookie: getSessionCookie(response) };
    }

    async function api(path, { method = "GET", cookie, body } = {}) {
      const headers = {};

      if (cookie) {
        headers.cookie = cookie;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${server.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });

      return response;
    }

    async function jsonApi(path, options) {
      const response = await api(path, options);

      return { status: response.status, body: await readJson(response) };
    }

    const userA = await register("owner-a");
    const userB = await register("owner-b");

    const alpha = await jsonApi("/api/clients", {
      method: "POST",
      cookie: userA.cookie,
      body: { name: "Alpha LLC" },
    });
    const bravo = await jsonApi("/api/clients", {
      method: "POST",
      cookie: userB.cookie,
      body: { name: "Bravo Inc" },
    });

    assert.equal(alpha.status, 201);
    assert.equal(bravo.status, 201);

    const baseInvoice = {
      clientId: alpha.body.id,
      issueDate: "2026-10-01",
      dueDate: "2026-10-15",
      taxPercent: 8.25,
      items: [{ description: "Consulting", quantity: 3, unitPriceCents: 334 }],
    };

    const draft = await jsonApi("/api/invoices", {
      method: "POST",
      cookie: userA.cookie,
      body: baseInvoice,
    });

    assert.equal(draft.status, 201);

    const invoiceId = draft.body.id;
    const invoiceNumber = draft.body.number;

    await t.test("logged-out PDF requests get 401 JSON", async () => {
      const response = await api(`/api/invoices/${invoiceId}/pdf`);

      assert.equal(response.status, 401);
      assertErrorBody(await readJson(response));
    });

    await t.test("another owner's invoice PDF is 404 JSON", async () => {
      const response = await api(`/api/invoices/${invoiceId}/pdf`, {
        cookie: userB.cookie,
      });

      assert.equal(response.status, 404);
      assertErrorBody(await readJson(response));
    });

    async function expectPdf(response, expectedFilename) {
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-type"),
        "application/pdf",
        "PDF responses are not JSON"
      );

      const disposition = response.headers.get("content-disposition") ?? "";

      assert.ok(
        disposition.includes(`filename="${expectedFilename}"`),
        `unexpected Content-Disposition: ${disposition}`
      );
      assert.equal(
        response.headers.get("cache-control"),
        "private, no-store"
      );

      const bytes = new Uint8Array(await response.arrayBuffer());
      const head = new TextDecoder("ascii").decode(bytes.slice(0, 5));

      assert.equal(head, "%PDF-", "body must be a PDF");
      assert.ok(bytes.byteLength > 1000, "PDF must have real content");

      return bytes;
    }

    await t.test("the owner downloads the draft with the number as filename", async () => {
      const response = await api(`/api/invoices/${invoiceId}/pdf`, {
        cookie: userA.cookie,
      });

      await expectPdf(response, `${invoiceNumber}.pdf`);
    });

    await t.test("PDF works for SENT and PAID statuses", async () => {
      const sent = await api(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie: userA.cookie,
        body: { status: "SENT" },
      });

      assert.equal(sent.status, 200);
      await expectPdf(
        await api(`/api/invoices/${invoiceId}/pdf`, { cookie: userA.cookie }),
        `${invoiceNumber}.pdf`
      );

      const paid = await api(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie: userA.cookie,
        body: { status: "PAID" },
      });

      assert.equal(paid.status, 200);
      await expectPdf(
        await api(`/api/invoices/${invoiceId}/pdf`, { cookie: userA.cookie }),
        `${invoiceNumber}.pdf`
      );
    });

    await t.test("PDF uses the profile currency and payment profile", async () => {
      const profile = await api("/api/business-profile", {
        method: "PUT",
        cookie: userA.cookie,
        body: {
          businessName: "Acme Studio",
          address: "42 Market Road",
          currency: "INR",
          defaultTaxPercent: 8.25,
          paymentInstructions: "NEFT to Acme Studio",
        },
      });

      assert.equal(profile.status, 200);

      const invoice = await jsonApi("/api/invoices", {
        method: "POST",
        cookie: userA.cookie,
        body: { ...baseInvoice, notes: "Thank you for your business." },
      });

      assert.equal(invoice.status, 201);

      await expectPdf(
        await api(`/api/invoices/${invoice.body.id}/pdf`, {
          cookie: userA.cookie,
        }),
        `${invoice.body.number}.pdf`
      );
    });

    await t.test("60+ line items produce a multi-page PDF", async () => {
      const items = Array.from({ length: 65 }, (_unused, index) => ({
        description: `Line item ${index + 1}: a reasonably long professional services description for wrapping checks`,
        quantity: 1,
        unitPriceCents: 1000 + index,
      }));

      const bigInvoice = await jsonApi("/api/invoices", {
        method: "POST",
        cookie: userA.cookie,
        body: { ...baseInvoice, items },
      });

      assert.equal(bigInvoice.status, 201);

      const response = await api(
        `/api/invoices/${bigInvoice.body.id}/pdf`,
        { cookie: userA.cookie }
      );

      const bytes = await expectPdf(
        response,
        `${bigInvoice.body.number}.pdf`
      );

      const text = new TextDecoder("latin1").decode(bytes);
      const pageCount = (text.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;

      assert.ok(
        pageCount >= 2,
        `expected more than one /Type /Page object, saw ${pageCount}`
      );
    });

    await t.test("an unknown invoice id is 404, not 500", async () => {
      const response = await api("/api/invoices/does-not-exist/pdf", {
        cookie: userA.cookie,
      });

      assert.equal(response.status, 404);
      assertErrorBody(await readJson(response));
    });
  }
);
