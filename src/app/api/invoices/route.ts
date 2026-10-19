import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  createInvoiceForUser,
  InvoiceInputError,
  isInvoiceNumberConflict,
  serializeInvoice,
  serializeInvoiceListItem,
} from "@/lib/invoices";
import { InvoiceCalculationError } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { invoiceCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  try {
    const invoices = await getPrisma().invoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    });

    return NextResponse.json(invoices.map(serializeInvoiceListItem));
  } catch (error) {
    console.error(
      "Invoice list failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load invoices.", 500);
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

  const parsed = invoiceCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid invoice.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    let invoice: Awaited<ReturnType<typeof createInvoiceForUser>> | null =
      null;

    for (let attempt = 0; attempt < 2 && !invoice; attempt += 1) {
      try {
        invoice = await createInvoiceForUser(user.id, parsed.data);
      } catch (error) {
        if (attempt === 0 && isInvoiceNumberConflict(error)) {
          continue;
        }

        throw error;
      }
    }

    if (!invoice) {
      return jsonError("Unable to create invoice.", 500);
    }

    return NextResponse.json(serializeInvoice(invoice), { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceInputError || error instanceof InvoiceCalculationError) {
      return jsonError(error.message, 400);
    }

    console.error(
      "Invoice creation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to create invoice.", 500);
  }
}
