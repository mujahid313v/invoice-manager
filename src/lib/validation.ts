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

// The invoice payloads live in `@/lib/invoice-schema` so the create route,
// the update route, the status route and the invoice form all share one
// definition. They are re-exported here because this module is their
// original home.
export {
  invoiceCreateSchema,
  invoiceItemSchema,
  invoiceStatusUpdateSchema,
  invoiceUpdateSchema,
} from "./invoice-schema.ts";
export type {
  InvoiceCreateInput,
  InvoiceItemInput,
  InvoiceStatusUpdateInput,
  InvoiceUpdateInput,
} from "./invoice-schema.ts";

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
