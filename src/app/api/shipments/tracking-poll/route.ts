import { NextResponse } from "next/server";
import { pollAllTracking } from "@/lib/api/shipping-client";

/**
 * POST /api/shipments/tracking-poll — bulk poll all submitted/in_transit shipments
 */
export async function POST() {
  try {
    const result = await pollAllTracking();
    return NextResponse.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to poll tracking";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
