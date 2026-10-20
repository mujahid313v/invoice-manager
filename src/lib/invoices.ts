import { Prisma } from "@prisma/client";
import { effectiveInvoiceStatus } from "@/lib/invoice-list";
import {
  computeInvoiceTotals,
  formatDateOnly,
  formatInvoiceNumber,
  parseDateOnly,
} from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import type { InvoiceCreateInput } from "@/lib/validation";

export class InvoiceInputError extends Error {}

export function isInvoiceNumberConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Invoice_userId_number_key") &&
    error.message.includes('code: "23505"')
  );
}

type DecimalLike = { toNumber: () => number };

type InvoiceItemRecord = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
};

type InvoiceRecord = {
  id: string;
  number: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  taxPercent: DecimalLike;
  discountCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  clientId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeInvoice(
  invoice: InvoiceRecord & { items: InvoiceItemRecord[] }
) {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: formatDateOnly(invoice.issueDate),
    dueDate: formatDateOnly(invoice.dueDate),
    taxPercent: invoice.taxPercent.toNumber(),
    discountCents: invoice.discountCents,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    clientId: invoice.clientId,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    items: invoice.items.map((item) => ({
      id: item.id,
      position: item.position,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  };
}

export function serializeInvoiceListItem(
  invoice: InvoiceRecord & { client: { name: string } },
  now: Date = new Date()
) {
  return {
    id: invoice.id,
    number: invoice.number,
    status: effectiveInvoiceStatus(invoice, now),
    issueDate: formatDateOnly(invoice.issueDate),
    dueDate: formatDateOnly(invoice.dueDate),
    taxPercent: invoice.taxPercent.toNumber(),
    discountCents: invoice.discountCents,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    clientId: invoice.clientId,
    clientName: invoice.client.name,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

export async function createInvoiceForUser(
  userId: string,
  input: InvoiceCreateInput
) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: input.clientId, userId },
      select: { id: true },
    });

    if (!client) {
      throw new InvoiceInputError("Select a client from your account.");
    }

    let taxPercent = input.taxPercent;

    if (taxPercent === undefined) {
      const profile = await tx.businessProfile.findUnique({
        where: { userId },
        select: { defaultTaxPercent: true },
      });

      taxPercent = profile ? profile.defaultTaxPercent.toNumber() : 0;
    }

    const discountCents = input.discountCents ?? 0;
    const totals = computeInvoiceTotals(input.items, taxPercent, discountCents);

    const counter = await tx.user.update({
      where: { id: userId },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true },
    });

    const invoice = await tx.invoice.create({
      data: {
        userId,
        clientId: client.id,
        number: formatInvoiceNumber(counter.nextInvoiceNumber - 1),
        issueDate: parseDateOnly(input.issueDate),
        dueDate: parseDateOnly(input.dueDate),
        taxPercent,
        discountCents,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        items: {
          create: input.items.map((item, index) => ({
            position: index,
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
        },
      },
      include: { items: { orderBy: { position: "asc" } } },
    });

    return invoice;
  });
}
