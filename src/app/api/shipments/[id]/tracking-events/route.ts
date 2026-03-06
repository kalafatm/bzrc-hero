import { NextRequest, NextResponse } from "next/server";
import { getTrackingEvents } from "@/lib/api/shipping-client";

/**
 * GET /api/shipments/[id]/tracking-events — get cached tracking events
 * Backend returns TrackingEvent[], we wrap it for the frontend.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const events = await getTrackingEvents(parseInt(id, 10));
    // Wrap in shape compatible with TrackingData used by shipments page
    return NextResponse.json({
      shipment_id: parseInt(id, 10),
      airwaybill_number: events[0]?.airwaybill_number || "",
      events,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to get tracking events";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
