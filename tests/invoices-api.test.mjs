import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const enabled = process.env.RUN_INVOICES_API_TESTS === "1";
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

function assertIntegerCents(value, label) {
  assert.equal(
    Number.isInteger(value),
    true,
    `${label} must be an integer number of cents`
  );
}

function assertInvoiceShape(invoice) {
  assert.equal(typeof invoice.id, "string");
  assert.equal(typeof invoice.number, "string");
  assert.match(invoice.number, /^INV-\d{4,}$/);
  assert.equal("userId" in invoice, false, "userId must not be exposed");
  for (const field of [
    "subtotalCents",
    "taxCents",
    "totalCents",
    "discountCents",
  ]) {
    assertIntegerCents(invoice[field], field);
  }
  for (const item of invoice.items ?? []) {
    assertIntegerCents(item.unitPriceCents, "items[].unitPriceCents");
    assert.equal(Number.isInteger(item.quantity), true);
  }
}

async function startServer() {
  const externalBaseUrl = process.env.INVOICES_API_BASE_URL;

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

  const port = Number(process.env.INVOICES_API_PORT ?? randomInt(3400, 4400));
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
  "invoices API integration",
  {
    skip: enabled
      ? false
      : "Set RUN_INVOICES_API_TESTS=1 with .env loaded to run live API tests.",
    timeout: 180_000,
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
          assert.match(user.email, /^issue4-api-/);

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
              (SELECT count(*)::int FROM "User" WHERE id = ${user.id})
                AS users
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
      const email = `issue4-api-${label}-${Date.now()}-${randomUUID().slice(
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

    const createClient = (cookie, name) =>
      api("/api/clients", { method: "POST", cookie, body: { name } });

    const createInvoice = (cookie, payload) =>
      api("/api/invoices", { method: "POST", cookie, body: payload });

    const alpha = await createClient(cookieA, "Alpha");
    const bravo = await createClient(cookieB, "Bravo");

    assert.equal(alpha.status, 201);
    assert.equal(bravo.status, 201);

    await t.test("every invoices endpoint requires authentication", async () => {
      for (const route of [
        { method: "GET", path: "/api/invoices" },
        {
          method: "POST",
          path: "/api/invoices",
          body: {
            clientId: alpha.body.id,
            issueDate: "2026-10-19",
            dueDate: "2026-11-02",
            items: [
              { description: "Blocked", quantity: 1, unitPriceCents: 100 },
            ],
          },
        },
      ]) {
        const response = await api(route.path, {
          method: route.method,
          body: route.body,
        });

        assert.equal(response.status, 401, `${route.method} ${route.path}`);
        assertErrorBody(response.body);
      }
    });

    await t.test(
      "creates a draft invoice with exact server-side totals",
      async () => {
        const created = await createInvoice(cookieA, {
          clientId: alpha.body.id,
          issueDate: "2026-10-19",
          dueDate: "2026-11-02",
          taxPercent: 8.25,
          discountCents: 2,
          items: [{ description: "Consulting", quantity: 3, unitPriceCents: 334 }],
        });

        assert.equal(created.status, 201);
        assertInvoiceShape(created.body);
        assert.equal(created.body.number, "INV-0001");
        assert.equal(created.body.status, "DRAFT");
        assert.equal(created.body.issueDate, "2026-10-19");
        assert.equal(created.body.dueDate, "2026-11-02");
        assert.equal(created.body.taxPercent, 8.25);
        assert.equal(created.body.subtotalCents, 1002);
        assert.equal(created.body.discountCents, 2);
        assert.equal(created.body.taxCents, 83);
        assert.equal(created.body.totalCents, 1083);
        assert.equal(created.body.items.length, 1);
        assert.equal(created.body.items[0].description, "Consulting");
        assert.equal(created.body.items[0].position, 0);
      }
    );

    await t.test("second invoice increments per user", async () => {
      const second = await createInvoice(cookieA, {
        clientId: alpha.body.id,
        issueDate: "2026-10-20",
        dueDate: "2026-11-03",
        taxPercent: 0,
        items: [
          { description: "Logo", quantity: 1, unitPriceCents: 25000 },
          { description: "Hours", quantity: 4, unitPriceCents: 9900 },
        ],
      });
      const firstB = await createInvoice(cookieB, {
        clientId: bravo.body.id,
        issueDate: "2026-10-20",
        dueDate: "2026-11-03",
        taxPercent: 0,
        items: [{ description: "Flyer", quantity: 1, unitPriceCents: 500 }],
      });

      assert.equal(second.status, 201);
      assert.equal(second.body.number, "INV-0002");
      assert.equal(second.body.subtotalCents, 64600);
      assert.equal(second.body.totalCents, 64600);
      assert.equal(firstB.status, 201);
      assertInvoiceShape(firstB.body);
      assert.equal(
        firstB.body.number,
        "INV-0001",
        "each owner's numbering starts at INV-0001"
      );
    });

    await t.test("fabricated totals are rejected and have no effect", async () => {
      const injected = await createInvoice(cookieA, {
        clientId: alpha.body.id,
        issueDate: "2026-10-21",
        dueDate: "2026-11-04",
        taxPercent: 0,
        items: [{ description: "Hacked", quantity: 1, unitPriceCents: 1000 }],
        subtotalCents: 1,
        taxCents: 1,
        totalCents: 1,
      });

      assert.equal(injected.status, 400);
      assertErrorBody(injected.body);

      const honest = await createInvoice(cookieA, {
        clientId: alpha.body.id,
        issueDate: "2026-10-21",
        dueDate: "2026-11-04",
        taxPercent: 0,
        items: [{ description: "Honest", quantity: 1, unitPriceCents: 1000 }],
      });

      assert.equal(honest.status, 201);
      assert.equal(honest.body.subtotalCents, 1000);
      assert.equal(honest.body.taxCents, 0);
      assert.equal(honest.body.totalCents, 1000);
    });

    await t.test("other owner's clientId returns 400 without leaking", async () => {
      const response = await createInvoice(cookieA, {
        clientId: bravo.body.id,
        issueDate: "2026-10-21",
        dueDate: "2026-11-04",
        taxPercent: 0,
        items: [{ description: "Stolen", quantity: 1, unitPriceCents: 100 }],
      });

      assert.equal(response.status, 400);
      assertErrorBody(response.body);
      assert.equal(
        JSON.stringify(response.body).includes("Bravo"),
        false,
        "error must not leak the other user's client name"
      );
    });

    await t.test("validation rejects bad payloads with readable messages", async () => {
      const cases = [
        {
          label: "empty items",
          payload: {
            clientId: alpha.body.id,
            issueDate: "2026-10-21",
            dueDate: "2026-11-04",
            items: [],
          },
        },
        {
          label: "zero quantity",
          payload: {
            clientId: alpha.body.id,
            issueDate: "2026-10-21",
            dueDate: "2026-11-04",
            items: [{ description: "x", quantity: 0, unitPriceCents: 100 }],
          },
        },
        {
          label: "blank description",
          payload: {
            clientId: alpha.body.id,
            issueDate: "2026-10-21",
            dueDate: "2026-11-04",
            items: [{ description: "   ", quantity: 1, unitPriceCents: 100 }],
          },
        },
        {
          label: "invalid issue date",
          payload: {
            clientId: alpha.body.id,
            issueDate: "2026-02-30",
            dueDate: "2026-11-04",
            items: [{ description: "x", quantity: 1, unitPriceCents: 100 }],
          },
        },
        {
          label: "discount above subtotal",
          payload: {
            clientId: alpha.body.id,
            issueDate: "2026-10-21",
            dueDate: "2026-11-04",
            discountCents: 200,
            items: [{ description: "x", quantity: 1, unitPriceCents: 100 }],
          },
        },
      ];

      for (const testCase of cases) {
        const response = await createInvoice(cookieA, testCase.payload);

        assert.equal(response.status, 400, testCase.label);
        const message =
          response.body?.error ??
          response.body?.issues?.map((issue) => issue.message).join(" ");
        assert.equal(typeof message, "string", testCase.label);
        assert.ok(message.length > 0, `${testCase.label}: readable message`);
      }
    });

    await t.test(
      "taxPercent falls back to the business profile default",
      async () => {
        const profile = await api("/api/business-profile", {
          method: "PUT",
          cookie: cookieB,
          body: {
            businessName: "Bravo Biz",
            address: null,
            logoUrl: null,
            currency: "USD",
            defaultTaxPercent: 12.5,
            paymentInstructions: null,
          },
        });

        assert.equal(profile.status, 200);

        const created = await createInvoice(cookieB, {
          clientId: bravo.body.id,
          issueDate: "2026-10-21",
          dueDate: "2026-11-04",
          items: [{ description: "Default tax", quantity: 2, unitPriceCents: 400 }],
        });

        assert.equal(created.status, 201);
        assert.equal(created.body.taxPercent, 12.5);
        assert.equal(created.body.taxCents, 100);
        assert.equal(created.body.totalCents, 900);
      }
    );

    await t.test(
      "list is owner-scoped, newest first and shows client names",
      async () => {
        const listA = await api("/api/invoices", { cookie: cookieA });
        const listB = await api("/api/invoices", { cookie: cookieB });

        assert.equal(listA.status, 200);
        assert.equal(Array.isArray(listA.body), true);
        assert.ok(listA.body.length >= 3);

        for (const invoice of listA.body) {
          assert.equal(
            invoice.clientName,
            "Alpha",
            "list rows carry the owner's client name"
          );
          assertIntegerCents(invoice.totalCents, "totalCents");
        }

        const dates = listA.body.map((invoice) =>
          new Date(invoice.createdAt).getTime()
        );
        assert.deepEqual(
          dates,
          [...dates].sort((left, right) => right - left),
          "list must be newest first"
        );

        assert.equal(listB.status, 200);
        assert.ok(listB.body.length >= 2);
        for (const invoice of listB.body) {
          assert.equal(invoice.clientName, "Bravo");
        }

        const statuses = new Set(
          listA.body.map((invoice) => invoice.status)
        );
        assert.deepEqual([...statuses], ["DRAFT"]);
      }
    );
  }
);
