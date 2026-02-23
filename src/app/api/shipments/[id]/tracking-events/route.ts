import { NextRequest, NextResponse } from "next/server";
import { getTrackingEvents } from "@/lib/api/shipping-client";

/**
 * GET /api/shipments/[id]/tracking-events — get cached tracking events
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getTrackingEvents(parseInt(id, 10));
    return NextResponse.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to get tracking events";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
