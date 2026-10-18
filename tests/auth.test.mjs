import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.AUTH_SECRET =
  "test-session-secret-with-at-least-thirty-two-characters";

const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookieOptions,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} = await import("../src/lib/session.ts");

const { AUTH_RATE_LIMIT, checkRateLimit, getClientIp } = await import(
  "../src/lib/rate-limit.ts"
);

const { credentialsSchema } = await import("../src/lib/validation.ts");

const testUser = { id: "user_123", email: "owner@example.com" };

test("signed session tokens round-trip the verified user", async () => {
  const token = await signSessionToken(testUser);

  assert.equal(token.split(".").length, 3);
  assert.deepEqual(await verifySessionToken(token), testUser);
});

test("tampered and malformed session tokens are rejected", async () => {
  const token = await signSessionToken(testUser);
  const [header, payload, signature] = token.split(".");

  assert.equal(
    await verifySessionToken(`${header}.${payload}.${signature}x`),
    null
  );
  assert.equal(await verifySessionToken("not-a-jwt"), null);
  assert.equal(await verifySessionToken(""), null);
});

test("tokens signed with another secret are rejected", async () => {
  const token = await signSessionToken(testUser);
  process.env.AUTH_SECRET = "another-test-secret-with-at-least-32-chars";

  try {
    assert.equal(await verifySessionToken(token), null);
  } finally {
    process.env.AUTH_SECRET =
      "test-session-secret-with-at-least-thirty-two-characters";
  }
});

test("verification fails closed when AUTH_SECRET is missing", async () => {
  const token = await signSessionToken(testUser);
  const secret = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;

  try {
    assert.equal(await verifySessionToken(token), null);
    await assert.rejects(signSessionToken(testUser), /AUTH_SECRET/);
  } finally {
    process.env.AUTH_SECRET = secret;
  }
});

test("session cookie is httpOnly, lax and secure in production", () => {
  const options = sessionCookieOptions();

  assert.equal(SESSION_COOKIE_NAME, "session");
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, SESSION_MAX_AGE_SECONDS);
  assert.equal(options.secure, process.env.NODE_ENV === "production");

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    assert.equal(sessionCookieOptions().secure, true);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }

  assert.equal(clearSessionCookieOptions().maxAge, 0);
});

test("rate limiter blocks requests after the limit and resets", () => {
  const key = `rate-limit-${randomUUID()}`;
  const options = { limit: 2, windowMs: 60_000 };
  const now = 1_000_000;

  assert.deepEqual(checkRateLimit(key, options, now), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(checkRateLimit(key, options, now + 1_000), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(checkRateLimit(key, options, now + 2_000), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 58,
  });
  assert.equal(checkRateLimit(key, options, now + 60_000).allowed, true);
  assert.ok(AUTH_RATE_LIMIT.limit > 0);
  assert.ok(AUTH_RATE_LIMIT.windowMs > 0);
});

test("rate limit keys are isolated", () => {
  const options = { limit: 1, windowMs: 60_000 };
  const firstKey = `isolated-a-${randomUUID()}`;
  const secondKey = `isolated-b-${randomUUID()}`;

  assert.equal(checkRateLimit(firstKey, options, 5_000).allowed, true);
  assert.equal(checkRateLimit(firstKey, options, 5_000).allowed, false);
  assert.equal(checkRateLimit(secondKey, options, 5_000).allowed, true);
});

test("client IP extraction prefers the first forwarded address", () => {
  const forwarded = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": " 203.0.113.7, 10.0.0.1" },
  });
  const realIp = new Request("http://localhost/api/auth/login", {
    headers: { "x-real-ip": "198.51.100.4" },
  });
  const unknown = new Request("http://localhost/api/auth/login");
  const emptyForwarded = new Request("http://localhost/api/auth/login", {
    headers: {
      "x-forwarded-for": " , ",
      "x-real-ip": "198.51.100.9",
    },
  });

  assert.equal(getClientIp(forwarded), "203.0.113.7");
  assert.equal(getClientIp(realIp), "198.51.100.4");
  assert.equal(getClientIp(unknown), "unknown");
  assert.equal(getClientIp(emptyForwarded), "198.51.100.9");
});

test("credentials validation normalizes email and rejects invalid input", () => {
  const valid = credentialsSchema.safeParse({
    email: "  OWNER@Example.COM ",
    password: "a-secure-password",
  });

  assert.equal(valid.success, true);

  if (valid.success) {
    assert.equal(valid.data.email, "owner@example.com");
  }

  assert.equal(
    credentialsSchema.safeParse({
      email: "not-an-email",
      password: "a-secure-password",
    }).success,
    false
  );
  assert.equal(
    credentialsSchema.safeParse({
      email: "owner@example.com",
      password: "short",
    }).success,
    false
  );
  assert.equal(
    credentialsSchema.safeParse({
      email: "owner@example.com",
      password: "é".repeat(40),
    }).success,
    false
  );
});
