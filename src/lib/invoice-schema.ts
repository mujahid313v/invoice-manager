// Zod schemas for invoice payloads.
//
// The create and update bodies share exactly the same rules: the client sends
// the invoice content, never the totals. Both schemas are strict, so unknown
// keys such as `number`, `status`, `userId`, `paidAt`, `subtotalCents`,
// `taxCents` or `totalCents` are rejected instead of being ignored.
//
// This module only depends on `zod` so it can be shared by the API routes,
// the invoice form and the unit tests.

import { z } from "zod";

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const dateOnlySchema = (message: string) =>
  z.string().trim().refine(isValidDateOnly, message);

export const invoiceItemSchema = z.strictObject({
  description: z
    .string()
    .trim()
    .min(1, "Description is required.")
    .max(500, "Description must be at most 500 characters."),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(1_000_000, "Quantity is too large."),
  unitPriceCents: z
    .number()
    .int("Unit price must be whole cents.")
    .min(0, "Unit price cannot be negative.")
    .max(2_147_483_647, "Unit price is too large."),
});

const invoiceFields = {
  clientId: z.string().trim().min(1, "Client is required."),
  issueDate: dateOnlySchema("Enter a valid issue date."),
  dueDate: dateOnlySchema("Enter a valid due date."),
  taxPercent: z
    .number()
    .min(0, "Tax must be at least 0.")
    .max(100, "Tax must be at most 100.")
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
      "Tax must have at most two decimal places."
    )
    .optional(),
  discountCents: z
    .number()
    .int("Discount must be whole cents.")
    .min(0, "Discount cannot be negative.")
    .max(2_147_483_647, "Discount is too large.")
    .optional(),
  items: z
    .array(invoiceItemSchema)
    .min(1, "Add at least one line item.")
    .max(100, "Too many line items."),
};

export const invoiceCreateSchema = z.strictObject(invoiceFields);

// Editing a draft follows the exact same rules as creating one.
export const invoiceUpdateSchema = z.strictObject(invoiceFields);

export const invoiceStatusUpdateSchema = z.strictObject({
  status: z.enum(["SENT", "PAID"], {
    error: "Status must be SENT or PAID.",
  }),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
export type InvoiceStatusUpdateInput = z.infer<
  typeof invoiceStatusUpdateSchema
>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
