import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { clientListWhere, clientSelect } from "@/lib/clients";
import { getPrisma } from "@/lib/prisma";
import { clientSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const search = new URL(request.url).searchParams.get("search");

  try {
    const clients = await getPrisma().client.findMany({
      where: clientListWhere(user.id, search),
      orderBy: { name: "asc" },
      select: clientSelect,
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error(
      "Client list failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load clients.", 500);
  }
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const parsed = clientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid client.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const client = await getPrisma().client.create({
      data: { userId: user.id, ...parsed.data },
      select: clientSelect,
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error(
      "Client creation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to create client.", 500);
  }
}
