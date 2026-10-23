import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const enabled = process.env.RUN_DASHBOARD_TESTS === "1";
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
  const externalBaseUrl = process.env.DASHBOARD_API_BASE_URL;

  if (externalBaseUrl) {
    return {
      baseUrl: externalBaseUrl.replace(/\/$/, ""),
      stop: async () => {},
    };
  }

  if (!existsSync(join(process.cwd(), ".next", "BUILD_ID"))) {
    throw new Error(
      "Production build missing. Run `npm run build` before the dashboard tests."
    );
  }

  const port = Number(
    process.env.DASHBOARD_API_PORT ?? randomInt(5400, 6400)
  );
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
  "dashboard API integration",
  {
    skip: enabled
      ? false
      : "Set RUN_DASHBOARD_TESTS=1 with .env loaded to run live dashboard tests.",
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
          assert.match(user.email, /^issue8-api-/);

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

    async function register(label) {
      const email = `issue8-api-${label}-${Date.now()}-${randomUUID().slice(
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

    async function createClient(cookie, name) {
      const created = await jsonApi("/api/clients", {
        method: "POST",
        cookie,
        body: { name },
      });

      assert.equal(created.status, 201);

      return created.body.id;
    }

    async function createInvoice(
      cookie,
      clientId,
      { issueDate, dueDate, unitPriceCents = 334, quantity = 3 } = {}
    ) {
      const created = await jsonApi("/api/invoices", {
        method: "POST",
        cookie,
        body: {
          clientId,
          issueDate,
          dueDate,
          taxPercent: 0,
          items: [
            {
              description: "Consulting",
              quantity,
              unitPriceCents,
            },
          ],
        },
      });

      assert.equal(created.status, 201, "invoice creation must succeed");

      return created.body;
    }

    async function markStatus(cookie, invoiceId, status) {
      const changed = await jsonApi(`/api/invoices/${invoiceId}/status`, {
        method: "PATCH",
        cookie,
        body: { status },
      });

      assert.equal(changed.status, 200, `${status} transition must succeed`);

      return changed.body;
    }

    async function dashboard(cookie) {
      const response = await api("/api/dashboard", { cookie });
      const body = await readJson(response);

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("cache-control"),
        "private, no-store"
      );

      return body;
    }

    function assertMonthWindow(monthlyRevenue) {
      assert.equal(monthlyRevenue.length, 6, "always exactly six months");

      const now = new Date();
      const currentKey = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
      ).padStart(2, "0")}`;

      assert.match(monthlyRevenue[0].month, /^\d{4}-\d{2}$/);
      assert.equal(
        monthlyRevenue[5].month,
        currentKey,
        "the newest bucket is the current UTC month"
      );

      // Oldest first: keys strictly increase.
      for (let index = 1; index < monthlyRevenue.length; index += 1) {
        assert.ok(
          monthlyRevenue[index].month > monthlyRevenue[index - 1].month
        );
      }
    }

    await t.test("logged-out requests get 401 JSON", async () => {
      const response = await api("/api/dashboard");

      assert.equal(response.status, 401);
      assertErrorBody(await readJson(response));
    });

    const userA = await register("owner-a");
    const userB = await register("owner-b");

    await t.test("a user with no invoices gets zeros and a full month window", async () => {
      const data = await dashboard(userA.cookie);

      assert.equal(data.totalRevenueCents, 0);
      assert.equal(data.outstandingCents, 0);
      assert.equal(data.overdueCount, 0);
      assert.equal(data.overdueCents, 0);
      assert.equal(data.totalInvoiceCount, 0);
      assert.deepEqual(data.latestInvoices, []);
      assert.equal(data.currency, "USD", "missing profile falls back to USD");
      assert.equal(data.hasBusinessProfile, false);
      assertMonthWindow(data.monthlyRevenue);

      for (const bucket of data.monthlyRevenue) {
        assert.equal(bucket.amountCents, 0, "dry months are zero-filled");
      }
    });

    const alphaClient = await createClient(userA.cookie, "Alpha LLC");
    const bravoClient = await createClient(userB.cookie, "Bravo Inc");

    const outstanding = await createInvoice(userA.cookie, alphaClient, {
      issueDate: "2026-09-01",
      dueDate: "2099-01-01",
    });
    await markStatus(userA.cookie, outstanding.id, "SENT");

    const overdue = await createInvoice(userA.cookie, alphaClient, {
      issueDate: "2020-01-01",
      dueDate: "2020-02-01",
      quantity: 5,
      unitPriceCents: 1000,
    });
    await markStatus(userA.cookie, overdue.id, "SENT");

    const paid = await createInvoice(userA.cookie, alphaClient, {
      issueDate: "2026-08-01",
      dueDate: "2026-09-01",
      quantity: 2,
      unitPriceCents: 501,
    });
    await markStatus(userA.cookie, paid.id, "SENT");
    await markStatus(userA.cookie, paid.id, "PAID");

    await createInvoice(userA.cookie, alphaClient, {
      issueDate: "2026-08-05",
      dueDate: "2099-06-01",
    });

    await t.test("stats match the DB exactly for the owner", async () => {
      const data = await dashboard(userA.cookie);

      assert.equal(data.totalRevenueCents, paid.totalCents);
      assert.equal(data.paidCount, 1);
      assert.equal(data.outstandingCents, outstanding.totalCents);
      assert.equal(data.overdueCount, 1);
      assert.equal(data.overdueCents, overdue.totalCents);
      assert.equal(data.totalInvoiceCount, 4);

      assertMonthWindow(data.monthlyRevenue);
      assert.equal(
        data.monthlyRevenue[5].amountCents,
        paid.totalCents,
        "paid revenue lands in the current month bucket"
      );

      let sum = 0;

      for (const bucket of data.monthlyRevenue) {
        sum += bucket.amountCents;
      }

      assert.equal(sum, data.totalRevenueCents);
    });

    await t.test("another user's data never changes anyone else's figures", async () => {
      const before = await dashboard(userA.cookie);
      const beforeB = await dashboard(userB.cookie);

      const bInvoice = await createInvoice(userB.cookie, bravoClient, {
        issueDate: "2026-08-01",
        dueDate: "2026-09-01",
        quantity: 100,
        unitPriceCents: 999999,
      });
      await markStatus(userB.cookie, bInvoice.id, "SENT");
      await markStatus(userB.cookie, bInvoice.id, "PAID");

      const afterA = await dashboard(userA.cookie);
      const afterB = await dashboard(userB.cookie);

      assert.deepEqual(
        afterA,
        { ...before },
        "user A sees nothing of user B's paid invoice"
      );
      assert.equal(afterB.totalRevenueCents, bInvoice.totalCents);
      assert.equal(beforeB.totalRevenueCents, 0);
      assert.equal(afterB.overdueCount, 0);
    });

    await t.test("paying an invoice moves its total from outstanding to revenue", async () => {
      const before = await dashboard(userA.cookie);

      await markStatus(userA.cookie, outstanding.id, "PAID");

      const after = await dashboard(userA.cookie);

      assert.equal(
        after.totalRevenueCents,
        before.totalRevenueCents + outstanding.totalCents
      );
      assert.equal(after.outstandingCents, 0);
      assert.equal(after.paidCount, before.paidCount + 1);
      assert.equal(
        after.monthlyRevenue[5].amountCents,
        before.monthlyRevenue[5].amountCents + outstanding.totalCents
      );
    });

    await t.test("a past-due sent invoice counts as overdue, not outstanding", async () => {
      const data = await dashboard(userA.cookie);

      assert.equal(data.overdueCount, 1);
      assert.equal(data.overdueCents, overdue.totalCents);

      const overdueInLatest = data.latestInvoices.find(
        (invoice) => invoice.id === overdue.id
      );

      assert.equal(
        overdueInLatest?.status,
        "OVERDUE",
        "the computed status travels with the latest list"
      );
    });

    await t.test("latest invoices are at most 5, newest first", async () => {
      let lastCreated = null;

      for (let index = 0; index < 3; index += 1) {
        lastCreated = await createInvoice(userA.cookie, alphaClient, {
          issueDate: "2026-09-02",
          dueDate: "2099-01-02",
        });
      }

      const data = await dashboard(userA.cookie);

      assert.equal(data.latestInvoices.length, 5);
      assert.equal(
        data.latestInvoices[0].number,
        lastCreated.number,
        "the newest created invoice leads the list"
      );

      const numbers = data.latestInvoices.map((invoice) => invoice.number);
      const unique = new Set(numbers);

      assert.equal(unique.size, numbers.length, "no duplicates");

      for (const invoice of data.latestInvoices) {
        assert.equal(typeof invoice.clientName, "string");
        assert.equal(typeof invoice.totalCents, "number");
        assert.match(invoice.issueDate, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(invoice.dueDate, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(
          ["DRAFT", "SENT", "PAID", "OVERDUE"].includes(invoice.status)
        );
      }
    });
  }
);
