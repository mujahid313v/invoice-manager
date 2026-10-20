import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  buildInvoiceListOrderBy,
  buildInvoiceListWhere,
} from "@/lib/invoice-list";
import {
  createInvoiceForUser,
  InvoiceInputError,
  isInvoiceNumberConflict,
  serializeInvoice,
  serializeInvoiceListItem,
} from "@/lib/invoices";
import { InvoiceCalculationError } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { invoiceCreateSchema, parseInvoiceListQuery } from "@/lib/validation";

export const runtime = "nodejs";

// Defaults (documented): sort=date (issueDate), order=desc (newest first),
// page=1, pageSize=10 (max 50). The `status` field in each row is the
// computed effective status; OVERDUE is never stored.
export async function GET(request: Request) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const searchParams = new URL(request.url).searchParams;
  const params: Record<string, string | undefined> = {};

  for (const key of new Set(searchParams.keys())) {
    params[key] = searchParams.get(key) ?? undefined;
  }

  const parsed = parseInvoiceListQuery(params);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const { data } = parsed;
  const now = new Date();

  try {
    const where = buildInvoiceListWhere(user.id, data, now);
    const [invoices, total] = await Promise.all([
      getPrisma().invoice.findMany({
        where,
        orderBy: buildInvoiceListOrderBy(data),
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
        include: { client: { select: { name: true } } },
      }),
      getPrisma().invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices: invoices.map((invoice) => serializeInvoiceListItem(invoice, now)),
      total,
      page: data.page,
      pageSize: data.pageSize,
    });
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
