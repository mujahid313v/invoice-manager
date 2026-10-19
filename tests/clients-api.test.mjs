import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const enabled = process.env.RUN_CLIENTS_API_TESTS === "1";
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

function assertClientShape(client) {
  assert.equal(typeof client.id, "string");
  assert.equal(typeof client.name, "string");
  assert.equal("userId" in client, false, "userId must not be exposed");
}

async function startServer() {
  const externalBaseUrl = process.env.CLIENTS_API_BASE_URL;

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

  const port = Number(process.env.CLIENTS_API_PORT ?? randomInt(3400, 4400));
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
  "clients API integration",
  {
    skip: enabled
      ? false
      : "Set RUN_CLIENTS_API_TESTS=1 with .env loaded to run live API tests.",
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
          assert.match(user.email, /^issue3-api-/);

          await sql`
            DELETE FROM "InvoiceItem"
            WHERE "invoiceId" IN (
              SELECT id FROM "Invoice" WHERE "userId" = ${user.id}
            )
          `;
          await sql`DELETE FROM "Invoice" WHERE "userId" = ${user.id}`;
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
      const email = `issue3-api-${label}-${Date.now()}-${randomUUID().slice(
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

    const createClient = (cookie, payload) =>
      api("/api/clients", { method: "POST", cookie, body: payload });

    const alpha = await createClient(cookieA, {
      name: "Alpha",
      email: "ALPHA@EXAMPLE.COM",
      phone: "  +1 555 0100  ",
      address: "1 Alpha Street",
      notes: "Net 30",
    });
    const charlie = await createClient(cookieA, {
      name: "Charlie",
      email: "charlie@example.com",
    });
    const zulu = await createClient(cookieA, {
      name: "Zulu",
      email: "zulu@example.com",
    });
    const bravo = await createClient(cookieB, {
      name: "Bravo",
      email: "bravo@example.com",
    });

    assert.equal(alpha.status, 201);
    assert.equal(charlie.status, 201);
    assert.equal(zulu.status, 201);
    assert.equal(bravo.status, 201);
    assert.equal(alpha.body.email, "alpha@example.com");
    assert.equal(alpha.body.phone, "+1 555 0100");
    [alpha, charlie, zulu, bravo].forEach(({ body }) =>
      assertClientShape(body)
    );

    await t.test("every clients endpoint requires authentication", async () => {
      const missing = "nonexistent-client-id";
      const cases = [
        { method: "GET", path: "/api/clients" },
        {
          method: "POST",
          path: "/api/clients",
          body: { name: "Blocked" },
        },
        { method: "GET", path: `/api/clients/${missing}` },
        {
          method: "PUT",
          path: `/api/clients/${missing}`,
          body: { name: "Blocked" },
        },
        { method: "DELETE", path: `/api/clients/${missing}` },
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

    await t.test("list is owner-scoped and ordered by name", async () => {
      const listA = await api("/api/clients", { cookie: cookieA });
      const listB = await api("/api/clients", { cookie: cookieB });

      assert.equal(listA.status, 200);
      assert.deepEqual(
        listA.body.map((client) => client.name),
        ["Alpha", "Charlie", "Zulu"]
      );
      assert.equal(listB.status, 200);
      assert.deepEqual(
        listB.body.map((client) => client.name),
        ["Bravo"]
      );
      [...listA.body, ...listB.body].forEach(assertClientShape);
    });

    await t.test(
      "search matches name and email case-insensitively",
      async () => {
        const byName = await api(
          `/api/clients?search=${encodeURIComponent("ALPHA")}`,
          { cookie: cookieA }
        );
        const byEmail = await api(
          `/api/clients?search=${encodeURIComponent(
            "CHARLIE@EXAMPLE.COM"
          )}`,
          { cookie: cookieA }
        );
        const empty = await api("/api/clients?search=", { cookie: cookieA });
        const spaces = await api(
          `/api/clients?search=${encodeURIComponent("   ")}`,
          { cookie: cookieA }
        );
        const none = await api(
          `/api/clients?search=${encodeURIComponent("no-such-client")}`,
          { cookie: cookieA }
        );
        const otherOwner = await api(
          `/api/clients?search=${encodeURIComponent("Alpha")}`,
          { cookie: cookieB }
        );

        assert.deepEqual(
          byName.body.map((client) => client.name),
          ["Alpha"]
        );
        assert.deepEqual(
          byEmail.body.map((client) => client.name),
          ["Charlie"]
        );
        assert.deepEqual(
          empty.body.map((client) => client.name),
          ["Alpha", "Charlie", "Zulu"]
        );
        assert.deepEqual(
          spaces.body.map((client) => client.name),
          ["Alpha", "Charlie", "Zulu"]
        );
        assert.deepEqual(none.body, []);
        assert.deepEqual(otherOwner.body, []);
      }
    );

    await t.test(
      "cross-owner read, update and delete return 404",
      async () => {
        const read = await api(`/api/clients/${alpha.body.id}`, {
          cookie: cookieB,
        });
        const update = await api(`/api/clients/${alpha.body.id}`, {
          method: "PUT",
          cookie: cookieB,
          body: {
            name: "Hijacked",
            email: "hijacked@example.com",
            phone: null,
            address: null,
            notes: null,
          },
        });
        const remove = await api(`/api/clients/${alpha.body.id}`, {
          method: "DELETE",
          cookie: cookieB,
        });
        const stillOwned = await api(`/api/clients/${alpha.body.id}`, {
          cookie: cookieA,
        });
        const missing = await api(`/api/clients/${randomUUID()}`, {
          cookie: cookieA,
        });

        assert.equal(read.status, 404);
        assert.equal(update.status, 404);
        assert.equal(remove.status, 404);
        assert.equal(stillOwned.status, 200);
        assert.equal(stillOwned.body.name, "Alpha");
        assert.equal(missing.status, 404);
        [read, update, remove, missing].forEach(({ body }) =>
          assertErrorBody(body)
        );
      }
    );

    await t.test(
      "validation rejects missing names, invalid emails and unknown fields",
      async () => {
        const missingName = await createClient(cookieA, {
          email: "valid@example.com",
        });
        const invalidEmail = await createClient(cookieA, {
          name: "Invalid Email",
          email: "not-an-email",
        });
        const injectedCreate = await createClient(cookieA, {
          name: "Injected Owner",
          userId: userB.id,
        });
        const injectedUpdate = await api(
          `/api/clients/${alpha.body.id}`,
          {
            method: "PUT",
            cookie: cookieA,
            body: {
              name: "Injected Update",
              userId: userB.id,
            },
          }
        );

        for (const response of [
          missingName,
          invalidEmail,
          injectedCreate,
          injectedUpdate,
        ]) {
          assert.equal(response.status, 400);
          assertErrorBody(response.body);
          assert.equal(Array.isArray(response.body.issues), true);
        }

        const unchanged = await api(`/api/clients/${alpha.body.id}`, {
          cookie: cookieA,
        });
        assert.equal(unchanged.body.name, "Alpha");
      }
    );

    await t.test(
      "optional fields normalize to null and email normalizes",
      async () => {
        const created = await createClient(cookieA, {
          name: "  Optional Client  ",
          email: "  UPPER@Example.COM ",
          phone: "   ",
          address: "",
          notes: "",
        });

        assert.equal(created.status, 201);
        assert.equal(created.body.name, "Optional Client");
        assert.equal(created.body.email, "upper@example.com");
        assert.equal(created.body.phone, null);
        assert.equal(created.body.address, null);
        assert.equal(created.body.notes, null);
      }
    );

    await t.test("owned client can be updated and read back", async () => {
      const updated = await api(`/api/clients/${alpha.body.id}`, {
        method: "PUT",
        cookie: cookieA,
        body: {
          name: "Alpha Updated",
          email: "  NEW@Example.COM ",
          phone: "",
          address: "  ",
          notes: "Updated notes",
        },
      });
      const read = await api(`/api/clients/${alpha.body.id}`, {
        cookie: cookieA,
      });

      assert.equal(updated.status, 200);
      assert.equal(updated.body.name, "Alpha Updated");
      assert.equal(updated.body.email, "new@example.com");
      assert.equal(updated.body.phone, null);
      assert.equal(updated.body.address, null);
      assert.equal(updated.body.notes, "Updated notes");
      assertClientShape(updated.body);
      assert.equal(read.status, 200);
      assert.deepEqual(read.body, updated.body);
    });

    await t.test("client without invoices can be deleted", async () => {
      const created = await createClient(cookieA, {
        name: "Delete Me",
      });

      assert.equal(created.status, 201);

      const removed = await api(`/api/clients/${created.body.id}`, {
        method: "DELETE",
        cookie: cookieA,
      });
      const read = await api(`/api/clients/${created.body.id}`, {
        cookie: cookieA,
      });

      assert.equal(removed.status, 204);
      assert.equal(removed.body, null);
      assert.equal(read.status, 404);
    });

    await t.test(
      "client with invoices returns 409 and is preserved",
      async () => {
        const created = await createClient(cookieA, {
          name: "Invoice Client",
        });

        assert.equal(created.status, 201);

        const invoiceId = randomUUID();
        await sql`
          INSERT INTO "Invoice" (
            id, "userId", "clientId", number, status, "issueDate", "dueDate",
            "taxPercent", "subtotalCents", "taxCents", "totalCents",
            "updatedAt"
          )
          VALUES (
            ${invoiceId}, ${userA.id}, ${created.body.id},
            ${`TEST-${randomUUID().slice(0, 8)}`}, 'DRAFT',
            CURRENT_DATE, CURRENT_DATE, 0, 1000, 0, 1000, NOW()
          )
        `;

        const removed = await api(`/api/clients/${created.body.id}`, {
          method: "DELETE",
          cookie: cookieA,
        });
        const read = await api(`/api/clients/${created.body.id}`, {
          cookie: cookieA,
        });
        const invoices = await sql`
          SELECT count(*)::int AS count FROM "Invoice"
          WHERE id = ${invoiceId}
        `;

        assert.equal(removed.status, 409);
        assert.match(removed.body.error, /invoices/i);
        assert.equal(read.status, 200);
        assert.equal(invoices[0].count, 1);
      }
    );
  }
);
