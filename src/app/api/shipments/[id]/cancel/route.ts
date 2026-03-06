import { NextRequest, NextResponse } from "next/server";
import { updateShipment } from "@/lib/api/shipping-client";

/**
 * POST /api/shipments/[id]/cancel — cancel a shipment (set status to "cancelled")
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shipment = await updateShipment(parseInt(id, 10), {
      status: "cancelled",
      status_message: "Cancelled by user",
    } as Record<string, unknown>);
    return NextResponse.json({ shipment });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to cancel shipment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
