import { Prisma } from "@prisma/client";

export function isClientInvoiceDeleteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2003";
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Invoice_clientId_fkey") &&
    (error.message.includes("violates RESTRICT setting") ||
      error.message.includes('code: "23001"'))
  );
}
