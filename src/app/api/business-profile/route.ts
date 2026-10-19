import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { businessProfileSchema } from "@/lib/validation";

export const runtime = "nodejs";

type ProfileRecord = {
  businessName: string;
  address: string | null;
  logoUrl: string | null;
  currency: string;
  defaultTaxPercent: { toNumber: () => number };
  paymentInstructions: string | null;
};

function serializeProfile(profile: ProfileRecord) {
  return {
    businessName: profile.businessName,
    address: profile.address,
    logoUrl: profile.logoUrl,
    currency: profile.currency,
    defaultTaxPercent: profile.defaultTaxPercent.toNumber(),
    paymentInstructions: profile.paymentInstructions,
  };
}

export async function GET() {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  try {
    const profile = await getPrisma().businessProfile.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json(profile ? serializeProfile(profile) : null);
  } catch (error) {
    console.error(
      "Business profile lookup failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load business profile.", 500);
  }
}

export async function PUT(request: Request) {
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

  const parsed = businessProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid business profile.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const profileData = parsed.data;

  try {
    const profile = await getPrisma().businessProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profileData },
      update: profileData,
    });

    return NextResponse.json(serializeProfile(profile));
  } catch (error) {
    console.error(
      "Business profile save failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to save business profile.", 500);
  }
}
