import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getDashboardForUser } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregation endpoint for the dashboard. It deliberately reads no query
// params or body: the only input is the session user, and every aggregate
// is scoped to that userId in the data layer.
export async function GET() {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  try {
    const dashboard = await getDashboardForUser(user.id);

    return NextResponse.json(dashboard, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(
      "Dashboard load failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load dashboard data.", 500);
  }
}
