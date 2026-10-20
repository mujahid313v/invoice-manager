import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { invoiceUpdateSchema } from "@/lib/invoice-schema";
import {
  deleteInvoiceForUser,
  findInvoiceForUser,
  InvoiceInputError,
  InvoiceNotFoundError,
  InvoiceStatusConflictError,
  serializeInvoiceDetail,
  updateInvoiceForUser,
} from "@/lib/invoices";
import { InvoiceCalculationError } from "@/lib/invoice-totals";

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
    const invoice = await findInvoiceForUser(user.id, id);

    if (!invoice) {
      return jsonError("Invoice not found.", 404);
    }

    return NextResponse.json(serializeInvoiceDetail(invoice));
  } catch (error) {
    console.error(
      "Invoice lookup failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load invoice.", 500);
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

  const parsed = invoiceUpdateSchema.safeParse(body);

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
    const invoice = await updateInvoiceForUser(user.id, id, parsed.data);

    if (!invoice) {
      return jsonError("Invoice not found.", 404);
    }

    return NextResponse.json(serializeInvoiceDetail(invoice));
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return jsonError(error.message, 404);
    }

    if (error instanceof InvoiceStatusConflictError) {
      return jsonError(error.message, 409);
    }

    if (error instanceof InvoiceInputError) {
      return jsonError(error.message, 400);
    }

    if (error instanceof InvoiceCalculationError) {
      return jsonError(error.message, 400);
    }

    console.error(
      "Invoice update failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to update invoice.", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const { id } = await params;

  try {
    await deleteInvoiceForUser(user.id, id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return jsonError(error.message, 404);
    }

    if (error instanceof InvoiceStatusConflictError) {
      return jsonError(error.message, 409);
    }

    console.error(
      "Invoice deletion failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to delete invoice.", 500);
  }
}
