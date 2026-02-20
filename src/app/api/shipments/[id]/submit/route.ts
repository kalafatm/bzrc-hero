import { NextRequest, NextResponse } from "next/server";
import { submitShipment } from "@/lib/api/shipping-client";

/**
 * POST /api/shipments/[id]/submit — submit shipment to Naqel via remote API
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shipment = await submitShipment(parseInt(id, 10));
    return NextResponse.json({ shipment });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to submit shipment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
