import { Prisma } from "@prisma/client";
import {
  canTransitionInvoiceStatus,
  sourceStatusForTransition,
  type InvoiceStatus,
} from "@/lib/invoice-status";
import { effectiveInvoiceStatus } from "@/lib/invoice-list";
import {
  computeInvoiceTotals,
  formatDateOnly,
  formatInvoiceNumber,
  parseDateOnly,
} from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import type {
  InvoiceCreateInput,
  InvoiceUpdateInput,
} from "@/lib/invoice-schema";

export class InvoiceInputError extends Error {}
export class InvoiceNotFoundError extends Error {}
export class InvoiceStatusConflictError extends Error {}

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
  notes?: string | null;
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
    notes: invoice.notes ?? null,
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

// The detail view carries the live client row and the computed display
// status.
//
// `status` is the stored status (DRAFT, SENT or PAID) and drives which
// actions are allowed. `displayStatus` is the computed badge value, which
// adds OVERDUE for a sent invoice whose due date has passed. Unlike the
// invoice list, where `status` is already the effective status, the detail
// payload exposes both so the client never has to recompute anything.
export function serializeInvoiceDetail(
  invoice: InvoiceRecord & {
    items: InvoiceItemRecord[];
    client: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      address: string | null;
    };
    notes: string | null;
    paidAt: Date | null;
  },
  now: Date = new Date()
) {
  return {
    ...serializeInvoice(invoice),
    displayStatus: effectiveInvoiceStatus(invoice, now),
    notes: invoice.notes,
    paidAt: invoice.paidAt,
    client: {
      id: invoice.client.id,
      name: invoice.client.name,
      email: invoice.client.email,
      phone: invoice.client.phone,
      address: invoice.client.address,
    },
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
        notes: input.notes ?? null,
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

// Loads an invoice with its items and live client row, scoped to the owner.
// Returns null when the invoice does not exist or belongs to someone else:
// the API turns that into a 404, never a 403.
export async function findInvoiceForUser(
  userId: string,
  invoiceId: string
) {
  return getPrisma().invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      items: { orderBy: { position: "asc" } },
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
        },
      },
    },
  });
}

// A cheap ownership probe for the route layout. It only selects the id, so
// it stays cheap while still answering "is this invoice yours?".
export async function invoiceExistsForUser(
  userId: string,
  invoiceId: string
): Promise<boolean> {
  const invoice = await getPrisma().invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true },
  });

  return invoice !== null;
}

// Edits a draft invoice. Ownership and the current status are re-checked in
// the same query that performs the write, so a concurrent status change
// cannot slip through between the check and the update.
export async function updateInvoiceForUser(
  userId: string,
  invoiceId: string,
  input: InvoiceUpdateInput
) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id: invoiceId, userId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new InvoiceNotFoundError("Invoice not found.");
    }

    if (existing.status !== "DRAFT") {
      throw new InvoiceStatusConflictError(
        "Only draft invoices can be edited."
      );
    }

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

    // The status guard lives in the write itself: the row is only updated
    // while it is still a DRAFT owned by this user.
    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, userId, status: "DRAFT" },
      data: {
        clientId: client.id,
        issueDate: parseDateOnly(input.issueDate),
        dueDate: parseDateOnly(input.dueDate),
        notes: input.notes ?? null,
        taxPercent,
        discountCents,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
      },
    });

    if (updated.count === 0) {
      throw new InvoiceStatusConflictError(
        "The invoice changed while you were working. Try again."
      );
    }

    // Replace the line items atomically with the new set.
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    await tx.invoiceItem.createMany({
      data: input.items.map((item, index) => ({
        invoiceId,
        position: index,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    });

    return tx.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: {
        items: { orderBy: { position: "asc" } },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
      },
    });
  });
}

// Applies a status transition. Only DRAFT -> SENT and SENT -> PAID are
// allowed. PAID is terminal and records the server clock in `paidAt`.
export async function changeInvoiceStatusForUser(
  userId: string,
  invoiceId: string,
  target: InvoiceStatus,
  now: Date = new Date()
) {
  const prisma = getPrisma();
  const source = sourceStatusForTransition(target);

  if (!source) {
    throw new InvoiceStatusConflictError(
      `An invoice cannot be marked as ${target}.`
    );
  }

  const data: Prisma.InvoiceUpdateManyMutationInput = { status: target };

  if (target === "PAID") {
    data.paidAt = now;
  }

  const updated = await prisma.invoice.updateMany({
    where: { id: invoiceId, userId, status: source },
    data,
  });

  if (updated.count === 0) {
    // Either the invoice is not owned, does not exist, or is not in the
    // required source status. The caller distinguishes the two with a
    // follow-up lookup.
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new InvoiceNotFoundError("Invoice not found.");
    }

    if (!canTransitionInvoiceStatus(existing.status as InvoiceStatus, target)) {
      throw new InvoiceStatusConflictError(
        `An invoice cannot move from ${existing.status} to ${target}.`
      );
    }

    throw new InvoiceStatusConflictError(
      "The invoice changed while you were working. Try again."
    );
  }

  return prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      items: { orderBy: { position: "asc" } },
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
        },
      },
    },
  });
}

// Deletes a draft invoice. The line items cascade from the schema.
export async function deleteInvoiceForUser(
  userId: string,
  invoiceId: string
) {
  const prisma = getPrisma();

  const deleted = await prisma.invoice.deleteMany({
    where: { id: invoiceId, userId, status: "DRAFT" },
  });

  if (deleted.count === 0) {
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new InvoiceNotFoundError("Invoice not found.");
    }

    throw new InvoiceStatusConflictError(
      "Only draft invoices can be deleted."
    );
  }
}
