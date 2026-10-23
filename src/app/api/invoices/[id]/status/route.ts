import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { invoiceStatusUpdateSchema } from "@/lib/invoice-schema";
import {
  changeInvoiceStatusForUser,
  InvoiceNotFoundError,
  InvoiceStatusConflictError,
  serializeInvoiceDetail,
} from "@/lib/invoices";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
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

  const parsed = invoiceStatusUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid status.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const invoice = await changeInvoiceStatusForUser(
      user.id,
      id,
      parsed.data.status
    );

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

    console.error(
      "Invoice status change failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to update invoice status.", 500);
  }
}
