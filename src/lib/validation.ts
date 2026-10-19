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

const optionalProfileText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((value) =>
      value === undefined || value === null || value === "" ? null : value
    );

export const businessProfileSchema = z.strictObject({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required.")
    .max(200, "Business name must be at most 200 characters."),
  address: optionalProfileText(500, "Address must be at most 500 characters."),
  logoUrl: optionalProfileText(
    2048,
    "Logo URL must be at most 2048 characters."
  ),
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
  paymentInstructions: optionalProfileText(
    2000,
    "Payment instructions must be at most 2000 characters."
  ),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
