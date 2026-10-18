import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ success: true });
  } catch {
    return jsonError("Unable to sign out.", 500);
  }
}
