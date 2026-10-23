import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const enabled = process.env.RUN_INVOICE_DETAIL_API_TESTS === "1";
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
  const externalBaseUrl = process.env.INVOICE_DETAIL_API_BASE_URL;

  if (externalBaseUrl) {
    return {
      baseUrl: externalBaseUrl.replace(/\/$/, ""),
      stop: async () => {},
    };
  }

  if (!existsSync(join(process.cwd(), ".next", "BUILD_ID"))) {
    throw new Error(
      "Production build missing. Run `npm run build` before the API tests."
    );
  }

  const port = Number(process.env.INVOICE_DETAIL_API_PORT ?? randomInt(4400, 5400));
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
  "invoice detail API integration",
  {
    skip: enabled
      ? false
      : "Set RUN_INVOICE_DETAIL_API_TESTS=1 with .env loaded to run live API tests.",
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
    let cleanupSummary = null;

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
          assert.match(user.email, /^issue6-api-/);

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

        cleanupSummary = [];

        for (const user of createdUsers) {
          const rows = await sql`
            SELECT
              (SELECT count(*)::int FROM "Invoice" WHERE "userId" = ${user.id})
                AS invoices,
              (SELECT count(*)::int FROM "Client" WHERE "userId" = ${user.id})
                AS clients,
              (SELECT count(*)::int FROM "User" WHERE id = ${user.id}) AS users
          `;

          cleanupSummary.push({ userId: user.id, ...rows[0] });
          assert.deepEqual(rows[0], { invoices: 0, clients: 0, users: 0 });
        }
      } catch (error) {
        cleanupError = error;
      }

      await server.stop();

      if (cleanupError) {
        throw cleanupError;
      }

      t.diagnostic(
        `Cleaned up ${createdUsers.length} temporary API test users: ${JSON.stringify(
          cleanupSummary
        )}`
      );
    });

    async function register(label) {
      const email = `issue6-api-${label}-${Date.now()}-${randomUUID().slice(
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
      assert.equal(body.user.email, email);

      createdUsers.push({ id: body.user.id, email });

      return {
        id: body.user.id,
        email,
        cookie: getSessionCookie(response),
      };
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

      return {
        status: response.status,
        body: await readJson(response),
      };
    }

    const userA = await register("owner-a");
    const userB = await register("owner-b");
    const cookieA = userA.cookie;
    const cookieB = userB.cookie;

    const alpha = await api("/api/clients", {
      method: "POST",
      cookie: cookieA,
      body: { name: "Alpha" },
    });
    const bravo = await api("/api/clients", {
      method: "POST",
      cookie: cookieB,
      body: { name: "Bravo" },
    });

    assert.equal(alpha.status, 201);
    assert.equal(bravo.status, 201);

    const createInvoice = (cookie, payload) =>
      api("/api/invoices", { method: "POST", cookie, body: payload });

    const baseInvoice = {
      clientId: alpha.body.id,
      issueDate: "2026-10-19",
      dueDate: "2026-11-02",
      taxPercent: 8.25,
      items: [{ description: "Consulting", quantity: 3, unitPriceCents: 334 }],
    };

    const draft = await createInvoice(cookieA, baseInvoice);

    assert.equal(draft.status, 201);
    assert.equal(draft.body.status, "DRAFT");
    assert.equal(draft.body.subtotalCents, 1002);
    assert.equal(draft.body.taxCents, 83);
    assert.equal(draft.body.totalCents, 1085);

    const invoiceId = draft.body.id;

    await t.test("every invoice detail endpoint requires authentication", async () => {
      const cases = [
        { method: "GET", path: `/api/invoices/${invoiceId}` },
        {
          method: "PUT",
          path: `/api/invoices/${invoiceId}`,
          body: baseInvoice,
        },
        {
          method: "PATCH",
          path: `/api/invoices/${invoiceId}/status`,
          body: { status: "SENT" },
        },
        { method: "DELETE", path: `/api/invoices/${invoiceId}` },
      ];

      for (const route of cases) {
        const response = await api(route.path, {
          method: route.method,
          body: route.body,
        });

        assert.equal(response.status, 401, `${route.method} ${route.path}`);
        assertErrorBody(response.body);
      }
    });

    await t.test("another owner's invoice is not found on any endpoint", async () => {
      const cases = [
        { method: "GET", path: `/api/invoices/${invoiceId}` },
        {
          method: "PUT",
          path: `/api/invoices/${invoiceId}`,
          body: baseInvoice,
        },
        {
          method: "PATCH",
          path: `/api/invoices/${invoiceId}/status`,
          body: { status: "SENT" },
        },
        { method: "DELETE", path: `/api/invoices/${invoiceId}` },
      ];

      for (const route of cases) {
        const response = await api(route.path, {
          method: route.method,
          cookie: cookieB,
          body: route.body,
        });

        assert.equal(response.status, 404, `${route.method} ${route.path}`);
        assertErrorBody(response.body);
      }

      // The owner's invoice is untouched by the attempts above.
      const stillThere = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(stillThere.status, 200);
      assert.equal(stillThere.body.status, "DRAFT");
    });

    await t.test("GET returns the invoice with its items and client", async () => {
      const response = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.id, invoiceId);
      assert.equal(response.body.number, "INV-0001");
      assert.equal(response.body.status, "DRAFT");
      assert.equal(response.body.displayStatus, "DRAFT");
      assert.equal(response.body.client.id, alpha.body.id);
      assert.equal(response.body.client.name, "Alpha");
      assert.equal(response.body.items.length, 1);
      assert.equal(response.body.items[0].description, "Consulting");
      assert.equal(response.body.items[0].position, 0);
      assert.equal("userId" in response.body, false);
    });

    await t.test("notes round-trip through create and edit", async () => {
      // Create with untrimmed notes.
      const created = await createInvoice(cookieA, {
        ...baseInvoice,
        notes: "  Thank you for your business!  ",
      });

      assert.equal(created.status, 201);
      assert.equal(created.body.notes, "Thank you for your business!");

      const notesId = created.body.id;

      // The detail GET returns the stored notes.
      const read = await api(`/api/invoices/${notesId}`, { cookie: cookieA });

      assert.equal(read.status, 200);
      assert.equal(read.body.notes, "Thank you for your business!");

      // Edit replaces the notes.
      const edited = await api(`/api/invoices/${notesId}`, {
        method: "PUT",
        cookie: cookieA,
        body: { ...baseInvoice, notes: "Paid within 30 days." },
      });

      assert.equal(edited.status, 200);
      assert.equal(edited.body.notes, "Paid within 30 days.");

      // An empty string clears the notes back to null.
      const cleared = await api(`/api/invoices/${notesId}`, {
        method: "PUT",
        cookie: cookieA,
        body: { ...baseInvoice, notes: "   " },
      });

      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.notes, null);

      const afterClear = await api(`/api/invoices/${notesId}`, {
        cookie: cookieA,
      });

      assert.equal(afterClear.body.notes, null);

      // Over 2000 characters is rejected with a 400 and changes nothing.
      const tooLong = await api(`/api/invoices/${notesId}`, {
        method: "PUT",
        cookie: cookieA,
        body: { ...baseInvoice, notes: "x".repeat(2001) },
      });

      assert.equal(tooLong.status, 400);
      assertErrorBody(tooLong.body);

      const unchanged = await api(`/api/invoices/${notesId}`, {
        cookie: cookieA,
      });

      assert.equal(unchanged.body.notes, null);

      const cleanup = await api(`/api/invoices/${notesId}`, {
        method: "DELETE",
        cookie: cookieA,
      });

      assert.equal(cleanup.status, 204);
    });

    await t.test(
      "PUT on a draft recomputes totals and replaces the line items",
      async () => {
        const response = await api(`/api/invoices/${invoiceId}`, {
          method: "PUT",
          cookie: cookieA,
          body: {
            clientId: alpha.body.id,
            issueDate: "2026-10-20",
            dueDate: "2026-11-04",
            taxPercent: 10,
            discountCents: 500,
            items: [
              { description: "Design", quantity: 2, unitPriceCents: 1999 },
              { description: "Hours", quantity: 4, unitPriceCents: 9900 },
            ],
          },
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.issueDate, "2026-10-20");
        assert.equal(response.body.dueDate, "2026-11-04");
        assert.equal(response.body.taxPercent, 10);
        assert.equal(response.body.discountCents, 500);
        assert.equal(response.body.subtotalCents, 43598);
        assert.equal(response.body.taxCents, 4310);
        assert.equal(response.body.totalCents, 47408);
        assert.equal(response.body.items.length, 2);
        assert.equal(response.body.items[0].description, "Design");
        assert.equal(response.body.items[0].position, 0);
        assert.equal(response.body.items[1].position, 1);

        // The old line item is gone, not just hidden.
        const reread = await api(`/api/invoices/${invoiceId}`, {
          cookie: cookieA,
        });

        assert.equal(reread.body.items.length, 2);
        assert.equal(
          reread.body.items.some((item) => item.description === "Consulting"),
          false
        );
      }
    );

    await t.test("PUT cannot change the number, status or totals", async () => {
      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        cookie: cookieA,
        body: {
          ...baseInvoice,
          number: "INV-9999",
          status: "PAID",
          userId: userB.id,
          subtotalCents: 1,
          taxCents: 1,
          totalCents: 1,
        },
      });

      assert.equal(response.status, 400);
      assertErrorBody(response.body);

      const reread = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(reread.body.number, "INV-0001");
      assert.equal(reread.body.status, "DRAFT");
      assert.equal(reread.body.totalCents, 47408);
    });

    await t.test("PUT with another owner's client is rejected", async () => {
      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        cookie: cookieA,
        body: { ...baseInvoice, clientId: bravo.body.id },
      });

      assert.equal(response.status, 400);
      assertErrorBody(response.body);
      assert.equal(
        JSON.stringify(response.body).includes("Bravo"),
        false,
        "the error must not leak the other owner's client name"
      );
    });

    await t.test("PUT rejects an empty item list", async () => {
      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        cookie: cookieA,
        body: { ...baseInvoice, items: [] },
      });

      assert.equal(response.status, 400);
      assertErrorBody(response.body);
    });

    await t.test("an invalid status value is rejected", async () => {
      for (const status of ["DRAFT", "OVERDUE", "draft", "", "SENT,PAID"]) {
        const response = await api(`/api/invoices/${invoiceId}/status`, {
          method: "PATCH",
          cookie: cookieA,
          body: { status },
        });

        assert.equal(response.status, 400, `status=${JSON.stringify(status)}`);
        assertErrorBody(response.body);
      }
    });

    await t.test("DRAFT -> PAID is not allowed", async () => {
      const response = await api(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie: cookieA,
        body: { status: "PAID" },
      });

      assert.equal(response.status, 409);
      assertErrorBody(response.body);

      const reread = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(reread.body.status, "DRAFT");
      assert.equal(reread.body.paidAt, null);
    });

    await t.test("DRAFT -> SENT works and does not set paidAt", async () => {
      const response = await api(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie: cookieA,
        body: { status: "SENT" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "SENT");
      assert.equal(response.body.paidAt, null);

      const reread = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(reread.body.status, "SENT");
      assert.equal(reread.body.paidAt, null);
    });

    await t.test("PUT on a sent invoice returns 409 and changes nothing", async () => {
      const before = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        cookie: cookieA,
        body: {
          clientId: alpha.body.id,
          issueDate: "2026-10-25",
          dueDate: "2026-12-01",
          taxPercent: 0,
          items: [
            { description: "Should not apply", quantity: 1, unitPriceCents: 1 },
          ],
        },
      });

      assert.equal(response.status, 409);
      assertErrorBody(response.body);

      const after = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(after.body.issueDate, before.body.issueDate);
      assert.equal(after.body.dueDate, before.body.dueDate);
      assert.equal(after.body.totalCents, before.body.totalCents);
      assert.equal(after.body.items.length, before.body.items.length);
      assert.deepEqual(after.body.items, before.body.items);
    });

    await t.test("DELETE on a sent invoice returns 409", async () => {
      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
        cookie: cookieA,
      });

      assert.equal(response.status, 409);
      assertErrorBody(response.body);

      const reread = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(reread.status, 200);
    });

    await t.test("SENT -> PAID sets paidAt from the server clock", async () => {
      const before = Date.now();
      const response = await api(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie: cookieA,
        body: { status: "PAID" },
      });
      const after = Date.now();

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "PAID");
      assert.equal(typeof response.body.paidAt, "string");

      const paidAt = Date.parse(response.body.paidAt);

      assert.equal(Number.isNaN(paidAt), false);
      assert.ok(
        paidAt >= before - 5_000 && paidAt <= after + 5_000,
        "paidAt must come from the server clock"
      );
    });

    await t.test("PAID -> SENT is not allowed and paidAt is kept", async () => {
      const response = await api(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie: cookieA,
        body: { status: "SENT" },
      });

      assert.equal(response.status, 409);
      assertErrorBody(response.body);

      const reread = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(reread.body.status, "PAID");
      assert.equal(typeof reread.body.paidAt, "string");
      assert.equal(reread.body.displayStatus, "PAID");
    });

    await t.test("PUT on a paid invoice returns 409 and changes nothing", async () => {
      const before = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        cookie: cookieA,
        body: {
          clientId: alpha.body.id,
          issueDate: "2026-10-25",
          dueDate: "2026-12-01",
          taxPercent: 0,
          items: [
            { description: "Should not apply", quantity: 1, unitPriceCents: 1 },
          ],
        },
      });

      assert.equal(response.status, 409);
      assertErrorBody(response.body);

      const after = await api(`/api/invoices/${invoiceId}`, {
        cookie: cookieA,
      });

      assert.equal(after.body.totalCents, before.body.totalCents);
      assert.deepEqual(after.body.items, before.body.items);
    });

    await t.test("DELETE on a paid invoice returns 409", async () => {
      const response = await api(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
        cookie: cookieA,
      });

      assert.equal(response.status, 409);
      assertErrorBody(response.body);
    });

    await t.test(
      "a sent invoice with a past due date displays as OVERDUE",
      async () => {
        const overdue = await createInvoice(cookieA, {
          clientId: alpha.body.id,
          issueDate: "2026-01-05",
          dueDate: "2026-01-20",
          taxPercent: 0,
          items: [{ description: "Old work", quantity: 1, unitPriceCents: 5000 }],
        });

        assert.equal(overdue.status, 201);

        const sent = await api(`/api/invoices/${overdue.body.id}/status`, {
          method: "PATCH",
          cookie: cookieA,
          body: { status: "SENT" },
        });

        assert.equal(sent.status, 200);
        assert.equal(sent.body.status, "SENT");
        assert.equal(sent.body.displayStatus, "OVERDUE");

        const reread = await api(`/api/invoices/${overdue.body.id}`, {
          cookie: cookieA,
        });

        assert.equal(reread.body.status, "SENT");
        assert.equal(reread.body.displayStatus, "OVERDUE");
      }
    );

    await t.test("DELETE on a draft removes it and its items", async () => {
      const toDelete = await createInvoice(cookieA, {
        clientId: alpha.body.id,
        issueDate: "2026-10-19",
        dueDate: "2026-11-02",
        taxPercent: 0,
        items: [
          { description: "Doomed", quantity: 1, unitPriceCents: 1000 },
          { description: "Doomed too", quantity: 2, unitPriceCents: 2000 },
        ],
      });

      assert.equal(toDelete.status, 201);

      const itemsBefore = await sql`
        SELECT count(*)::int AS count
        FROM "InvoiceItem"
        WHERE "invoiceId" = ${toDelete.body.id}
      `;

      assert.equal(itemsBefore[0].count, 2);

      const response = await api(`/api/invoices/${toDelete.body.id}`, {
        method: "DELETE",
        cookie: cookieA,
      });

      assert.equal(response.status, 204);

      const reread = await api(`/api/invoices/${toDelete.body.id}`, {
        cookie: cookieA,
      });

      assert.equal(reread.status, 404);
      assertErrorBody(reread.body);

      const itemsAfter = await sql`
        SELECT count(*)::int AS count
        FROM "InvoiceItem"
        WHERE "invoiceId" = ${toDelete.body.id}
      `;

      assert.equal(
        itemsAfter[0].count,
        0,
        "the line items must cascade with the invoice"
      );
    });

    await t.test("deleting an unknown invoice returns 404", async () => {
      const response = await api("/api/invoices/does-not-exist", {
        method: "DELETE",
        cookie: cookieA,
      });

      assert.equal(response.status, 404);
      assertErrorBody(response.body);
    });
  }
);
