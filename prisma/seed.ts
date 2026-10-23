// Manual demo-data seed for the live demo account.
//
// SAFETY: this script is invoked only by `npm run db:seed` (or
// `npx prisma db seed`). It must never be wired into build, postinstall,
// start or any route. It only touches rows belonging to the demo user and
// never deletes anything outside it. It never logs secrets, hashes or the
// connection string.
//
// Requires Node.js >= 23.6 (native TypeScript execution) or >= 22.6 with
// --experimental-strip-types.

import { hash } from "bcryptjs";
import { getPrisma } from "../src/lib/prisma.ts";
import { buildSeedData } from "./seed-data.ts";

const DEMO_EMAIL = "demo@example.com";
// The public demo password. It only ever exists as a bcrypt hash at rest,
// identical in shape to a registered account (same bcryptjs cost 12).
const DEMO_PASSWORD = "demo1234";
const BCRYPT_ROUNDS = 12;

async function main() {
  const prisma = getPrisma();
  const data = buildSeedData(new Date());

  const passwordHash = await hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, passwordHash },
    select: { id: true, email: true },
  });

  await prisma.businessProfile.upsert({
    where: { userId: user.id },
    update: data.profile,
    create: { userId: user.id, ...data.profile },
  });

  for (const client of data.clients) {
    // updateMany-then-create instead of a plain id upsert: a row with this
    // deterministic id that belongs to a different user must never be
    // hijacked or silently overwritten.
    const updated = await prisma.client.updateMany({
      where: { id: client.id, userId: user.id },
      data: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        notes: client.notes,
      },
    });

    if (updated.count === 0) {
      const foreign = await prisma.client.findUnique({
        where: { id: client.id },
        select: { userId: true },
      });

      if (foreign) {
        throw new Error(
          `Client id ${client.id} exists but belongs to another user; refusing to modify it.`
        );
      }

      await prisma.client.create({
        data: {
          id: client.id,
          userId: user.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          notes: client.notes,
        },
      });
    }
  }

  for (const invoice of data.invoices) {
    await prisma.$transaction(async (tx) => {
      const row = await tx.invoice.upsert({
        where: {
          userId_number: { userId: user.id, number: invoice.number },
        },
        update: {
          clientId: invoice.clientKey,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          paidAt: invoice.paidAt,
          taxPercent: invoice.taxPercent,
          discountCents: invoice.discountCents,
          subtotalCents: invoice.subtotalCents,
          taxCents: invoice.taxCents,
          totalCents: invoice.totalCents,
          notes: invoice.notes,
        },
        create: {
          userId: user.id,
          clientId: invoice.clientKey,
          number: invoice.number,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          paidAt: invoice.paidAt,
          taxPercent: invoice.taxPercent,
          discountCents: invoice.discountCents,
          subtotalCents: invoice.subtotalCents,
          taxCents: invoice.taxCents,
          totalCents: invoice.totalCents,
          notes: invoice.notes,
        },
        select: { id: true },
      });

      // Replace the line items atomically so a re-run never duplicates them.
      await tx.invoiceItem.deleteMany({ where: { invoiceId: row.id } });
      await tx.invoiceItem.createMany({
        data: invoice.items.map((item, index) => ({
          invoiceId: row.id,
          position: index,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
        })),
      });
    });
  }

  // Keep the per-user invoice counter ahead of the seeded numbers so
  // app-created invoices get fresh numbers and never collide. Only ever
  // raise it, never lower it.
  await prisma.user.updateMany({
    where: { id: user.id, nextInvoiceNumber: { lt: data.invoices.length + 1 } },
    data: { nextInvoiceNumber: data.invoices.length + 1 },
  });

  const totalInvoices = await prisma.invoice.count({
    where: { userId: user.id },
  });
  const extraInvoices = totalInvoices - data.invoices.length;

  const statusCounts = data.invoices.reduce<Record<string, number>>(
    (counts, invoice) => {
      counts[invoice.status] = (counts[invoice.status] ?? 0) + 1;

      return counts;
    },
    {}
  );

  console.log(`Seeded demo account ${DEMO_EMAIL}.`);
  console.log(
    `Clients: ${data.clients.length}. Invoices: ${data.invoices.length} (DRAFT ${statusCounts.DRAFT}, SENT ${statusCounts.SENT}, PAID ${statusCounts.PAID}).`
  );

  if (extraInvoices > 0) {
    console.log(
      `Left ${extraInvoices} extra invoice(s) on the demo account untouched (created outside the seed).`
    );
  }

  console.log(
    "Note: seeding resets the demo password to the seed value; login rate limiting is unchanged."
  );
}

main()
  .catch((error) => {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPrisma().$disconnect();
    } catch {
      // The client was never created (for example a missing DATABASE_URL);
      // the failure above already reported the real problem.
    }
  });
