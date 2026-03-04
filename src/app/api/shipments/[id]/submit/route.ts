import { NextRequest, NextResponse } from "next/server";
import { submitShipment } from "@/lib/api/shipping-client";
import { updateOrder } from "@/lib/api/woo-client";

/**
 * POST /api/shipments/[id]/submit — submit shipment to Naqel via remote API
 * On success, writes AWB back to WC order meta (_bzrc_naqel_awb).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shipment = await submitShipment(parseInt(id, 10));

    // Write AWB to WooCommerce order meta
    if (shipment.airwaybill_number && shipment.woo_order_id) {
      try {
        await updateOrder(shipment.woo_order_id, {
          meta_data: [
            { key: "_bzrc_naqel_awb", value: shipment.airwaybill_number },
          ],
        });
      } catch {
        // Non-fatal: shipment succeeded even if WC meta update fails
      }
    }

    return NextResponse.json({ shipment });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to submit shipment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
