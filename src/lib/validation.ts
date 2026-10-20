import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must be at most 72 bytes."
  );

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type Credentials = z.infer<typeof credentialsSchema>;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((value) =>
      value === undefined || value === null || value === "" ? null : value
    );

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must be at most 254 characters.")
  .nullable()
  .optional()
  .transform((value) =>
    value === undefined || value === null || value === "" ? null : value
  )
  .refine(
    (value) => value === null || z.email().safeParse(value).success,
    "Enter a valid email address."
  );

export const businessProfileSchema = z.strictObject({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required.")
    .max(200, "Business name must be at most 200 characters."),
  address: optionalText(500, "Address must be at most 500 characters."),
  logoUrl: optionalText(2048, "Logo URL must be at most 2048 characters."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(
      z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code.")
    )
    .optional()
    .default("USD"),
  defaultTaxPercent: z
    .number()
    .min(0, "Default tax must be at least 0.")
    .max(100, "Default tax must be at most 100.")
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
      "Default tax must have at most 2 decimal places."
    ),
  paymentInstructions: optionalText(
    2000,
    "Payment instructions must be at most 2000 characters."
  ),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export const clientSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Client name is required.")
    .max(200, "Client name must be at most 200 characters."),
  email: optionalEmail,
  phone: optionalText(50, "Phone must be at most 50 characters."),
  address: optionalText(500, "Address must be at most 500 characters."),
  notes: optionalText(2000, "Notes must be at most 2000 characters."),
});

export type ClientInput = z.infer<typeof clientSchema>;

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

const dateOnlySchema = (message: string) =>
  z.string().trim().refine(isValidDateOnly, message);

const invoiceItemSchema = z.strictObject({
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

export const invoiceCreateSchema = z.strictObject({
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
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

const positiveIntParam = (label: string, max: number) =>
  z
    .string()
    .regex(/^\d+$/, `${label} must be a positive integer.`)
    .refine(
      (value) => Number(value) >= 1,
      `${label} must be a positive integer.`
    )
    .refine(
      (value) => Number(value) <= max,
      `${label} must be at most ${max}.`
    )
    .transform((value) => Number(value));

export const invoiceListQuerySchema = z.strictObject({
  search: z
    .string()
    .trim()
    .max(200, "Search must be at most 200 characters.")
    .optional(),
  status: z
    .enum(["DRAFT", "SENT", "PAID", "OVERDUE"], {
      error: "status must be DRAFT, SENT, PAID or OVERDUE.",
    })
    .optional(),
  sort: z.enum(["date", "amount"], {
    error: "sort must be date or amount.",
  }),
  order: z.enum(["asc", "desc"], {
    error: "order must be asc or desc.",
  }),
  page: positiveIntParam("page", 100_000),
  pageSize: positiveIntParam("pageSize", 50),
});

export type InvoiceListQuery = {
  search?: string;
  status?: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  sort: "date" | "amount";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
};

export function parseInvoiceListQuery(
  params: Record<string, string | undefined>
):
  | { success: true; data: InvoiceListQuery }
  | { success: false; error: z.ZodError } {
  const compact: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      compact[key] = value;
    }
  }

  const parsed = invoiceListQuerySchema.safeParse({
    sort: "date",
    order: "desc",
    page: "1",
    pageSize: "10",
    ...compact,
  });

  if (!parsed.success) {
    return parsed;
  }

  return {
    success: true,
    data: {
      ...parsed.data,
      search: parsed.data.search || undefined,
    },
  };
}
