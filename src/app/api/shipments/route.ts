import { NextRequest, NextResponse } from "next/server";
import {
  createShipment,
  listShipments,
} from "@/lib/api/shipping-client";
import { getOrder } from "@/lib/api/woo-client";
import { mapWooOrderToShipment } from "@/lib/api/woo-to-shipment";

/**
 * GET /api/shipments — list shipments from remote API
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status_filter = sp.get("status") || undefined;
    const limit = parseInt(sp.get("limit") || "50", 10);
    const offset = parseInt(sp.get("offset") || "0", 10);

    const shipments = await listShipments({ status_filter, limit, offset });
    return NextResponse.json({ shipments });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to list shipments";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/shipments — create shipment from a WC order
 * Body: { wooOrderId, carrier?, customer_code?, branch_code?, product_type?, cityCode?, countryCurrency?, convertedTotal? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      wooOrderId,
      customer_code,
      branch_code,
      product_type,
      cityCode,
      countryCurrency,
      convertedTotal,
    } = body;

    if (!wooOrderId) {
      return NextResponse.json(
        { error: "wooOrderId is required" },
        { status: 400 }
      );
    }

    // Check for existing shipment with this order ID (prevent duplicates)
    const existing = await listShipments({ woo_order_id: wooOrderId, limit: 1 });
    if (existing.length > 0) {
      const s = existing[0];
      // Allow re-create only if previous shipment failed
      if (s.status !== "submit_failed" && s.status !== "failed" && s.status !== "cancelled") {
        return NextResponse.json(
          { error: `Shipment #${s.id} already exists for order ${wooOrderId} (status: ${s.status})` },
          { status: 409 }
        );
      }
    }

    // Fetch order from WooCommerce
    const wooOrder = await getOrder(wooOrderId);

    // Map to shipment payload
    const payload = mapWooOrderToShipment(wooOrder, {
      customer_code,
      branch_code,
      product_type,
      cityCode,
      countryCurrency,
      convertedTotal,
    });

    // Create in remote shipping API
    const shipment = await createShipment(payload);

    return NextResponse.json({ shipment }, { status: 201 });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to create shipment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
