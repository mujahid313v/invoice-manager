import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { clientSelect } from "@/lib/clients";
import { getPrisma } from "@/lib/prisma";
import { isClientInvoiceDeleteConflict } from "@/lib/prisma-errors";
import { clientSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const { id } = await params;

  try {
    const client = await getPrisma().client.findFirst({
      where: { id, userId: user.id },
      select: clientSelect,
    });

    if (!client) {
      return jsonError("Client not found.", 404);
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error(
      "Client lookup failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load client.", 500);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const { id } = await params;

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
    const result = await getPrisma().client.updateMany({
      where: { id, userId: user.id },
      data: parsed.data,
    });

    if (result.count === 0) {
      return jsonError("Client not found.", 404);
    }

    const client = await getPrisma().client.findFirst({
      where: { id, userId: user.id },
      select: clientSelect,
    });

    if (!client) {
      return jsonError("Client not found.", 404);
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error(
      "Client update failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to update client.", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const { id } = await params;

  try {
    const result = await getPrisma().client.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      return jsonError("Client not found.", 404);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isClientInvoiceDeleteConflict(error)) {
      return jsonError(
        "Client cannot be deleted while invoices exist.",
        409
      );
    }

    console.error(
      "Client deletion failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to delete client.", 500);
  }
}
