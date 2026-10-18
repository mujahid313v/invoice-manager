import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
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

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `register:${getClientIp(request)}`,
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
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    const user = await getPrisma().user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });

    await createSession(user);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError("An account with this email already exists.", 409);
    }

    console.error(
      "Registration failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to create account.", 500);
  }
}
