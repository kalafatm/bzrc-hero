import { NextRequest, NextResponse } from "next/server";
import {
  createShipment,
  listShipments,
} from "@/lib/api/shipping-client";
import { getOrder } from "@/lib/api/woo-client";
import { mapWooOrderToShipment } from "@/lib/api/woo-to-shipment";
import { getCarrierConfig, getExitLocation, getExitLocationByCode } from "@/lib/api/google-sheets";

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
      carrier,
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

    // Exit location from WC order meta (bzrc_Naqel_Exit_Location = location code like RUH, IST)
    const exitLocationMeta = (wooOrder.meta_data || []).find(
      (m: { key: string; value: string }) => m.key === "bzrc_Naqel_Exit_Location"
    );
    const exitLocationCode = (exitLocationMeta?.value || "").toUpperCase();

    // Validate exit route
    const destCountry = wooOrder.shipping?.country || wooOrder.billing?.country;
    let originCityCode: string | undefined;
    if (destCountry) {
      const exitRoute = exitLocationCode
        ? await getExitLocationByCode(exitLocationCode, destCountry)
        : await getExitLocation("TR", destCountry);
      if (!exitRoute) {
        const origin = exitLocationCode || "TR";
        return NextResponse.json(
          { error: `Invalid route: No exit location configured for ${origin} → ${destCountry.toUpperCase()}. Add this route to the exitLocation sheet.` },
          { status: 422 }
        );
      }
      originCityCode = exitRoute.exitLocationCode;
    }

    // Look up carrier-specific declared value multiplier (COD only)
    let declaredValueMultiplier: number | undefined;
    if (carrier && wooOrder.payment_method === "cod") {
      const carrierCfg = await getCarrierConfig(carrier);
      if (carrierCfg) {
        declaredValueMultiplier = carrierCfg.declaredValueMultiplier;
      }
    }

    // Map to shipment payload (order already translated at fetch time)
    const payload = mapWooOrderToShipment(wooOrder, {
      carrier_code: carrier || "naqel",
      customer_code,
      branch_code,
      product_type,
      cityCode,
      countryCurrency,
      convertedTotal,
      declaredValueMultiplier,
      originCityCode,
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
