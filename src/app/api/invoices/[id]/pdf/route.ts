import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  buildInvoicePdfViewModel,
  isSafeLogoUrl,
} from "@/lib/invoice-pdf-data";
import { fetchInvoiceLogoBytes } from "@/lib/invoice-pdf-logo";
import { InvoiceDocument } from "@/lib/invoice-pdf";
import { findInvoiceForUser } from "@/lib/invoices";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    // Everything below is built from the owner's DB rows only; no invoice
    // value is ever taken from the request.
    const [invoice, profile] = await Promise.all([
      findInvoiceForUser(user.id, id),
      getPrisma().businessProfile.findUnique({
        where: { userId: user.id },
        select: {
          businessName: true,
          address: true,
          currency: true,
          paymentInstructions: true,
          logoUrl: true,
        },
      }),
    ]);

    if (!invoice) {
      return jsonError("Invoice not found.", 404);
    }

    const model = buildInvoicePdfViewModel(invoice, profile);
    const logoBytes = isSafeLogoUrl(profile?.logoUrl)
      ? await fetchInvoiceLogoBytes(profile!.logoUrl!)
      : null;

    const buffer = await renderToBuffer(
      InvoiceDocument({ model, logoBytes })
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${model.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(
      "Invoice PDF generation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to generate the invoice PDF.", 500);
  }
}
