import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { createSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  AUTH_RATE_LIMIT,
  checkRateLimit,
  getClientIp,
} from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validation";

export const runtime = "nodejs";

const DUMMY_PASSWORD_HASH =
  "$2b$12$mPW2bnpqmDAD6j2MXG6tsu1VePnbcocQ/ZrmxYU4.1ZlgSKohaeLG";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `login:${getClientIp(request)}`,
    AUTH_RATE_LIMIT
  );

  if (!rateLimit.allowed) {
    return jsonError("Too many attempts. Please try again later.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const parsed = credentialsSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  const { email, password } = parsed.data;

  try {
    const user = await getPrisma().user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });

    const passwordMatches = await compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH
    );

    if (!user || !passwordMatches) {
      return jsonError("Invalid email or password.", 401);
    }

    await createSession({ id: user.id, email: user.email });

    return NextResponse.json({
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error(
      "Login failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to sign in.", 500);
  }
}
