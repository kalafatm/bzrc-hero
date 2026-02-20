import { NextRequest, NextResponse } from "next/server";
import { getShipment } from "@/lib/api/shipping-client";

/**
 * GET /api/shipments/[id] — get single shipment from remote API
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shipment = await getShipment(parseInt(id, 10));
    return NextResponse.json({ shipment });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get shipment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
