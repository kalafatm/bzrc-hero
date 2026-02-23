import { NextRequest, NextResponse } from "next/server";
import { trackShipment } from "@/lib/api/shipping-client";

/**
 * POST /api/shipments/[id]/track — track shipment via GN Connect
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await trackShipment(parseInt(id, 10));
    return NextResponse.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to track shipment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
