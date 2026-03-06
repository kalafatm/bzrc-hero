import { NextRequest, NextResponse } from "next/server";
import {
  createShipment,
  listShipments,
  submitShipment,
  updateShipment,
} from "@/lib/api/shipping-client";
import { getOrder, updateOrder } from "@/lib/api/woo-client";
import { mapWooOrderToShipment } from "@/lib/api/woo-to-shipment";
import { matchCity } from "@/lib/api/city-matcher";
import {
  getCarrierConfig,
  getExitLocation,
  getNaqelCityCodes,
} from "@/lib/api/google-sheets";

/**
 * POST /api/shipments/bulk-submit
 * Body: { orderIds: number[] }
 *
 * For each WC order:
 *  1. Validate carrier (from WC meta bzrc_carrier)
 *  2. Validate exit route
 *  3. City match (use saved bzrc_city_code or auto-match)
 *  4. Currency conversion if needed
 *  5. Create shipment in DB
 *  6. Submit to carrier (Naqel)
 *
 * Returns streaming-style JSON with results array.
 */

interface BulkResult {
  orderId: number;
  orderNumber: string;
  status: "success" | "skipped" | "error";
  shipmentId?: number;
  awb?: string;
  error?: string;
}

// Country → currency map cache
let countryCurrencyMap: Record<string, string> | null = null;

async function getCountryCurrencyMap(
  cities: Awaited<ReturnType<typeof getNaqelCityCodes>>
): Promise<Record<string, string>> {
  if (countryCurrencyMap) return countryCurrencyMap;
  const map: Record<string, string> = {};
  for (const row of cities) {
    const cc = (row.countryCode || "").toUpperCase();
    const cur = (row.countryCurrency || "").toUpperCase();
    if (cc && cur && !map[cc]) {
      map[cc] = cur;
    }
  }
  countryCurrencyMap = map;
  return map;
}

// Currency conversion via backend TCMB-based exchange rates
const SHIPPING_API_URL =
  process.env.SHIPPING_API_URL || "https://dev.bazaarica.com";

async function convertCurrency(
  from: string,
  to: string,
  amount: number
): Promise<number | null> {
  try {
    const res = await fetch(
      `${SHIPPING_API_URL}/exchange-rates/convert?amount=${amount}&from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { converted: number };
    return data.converted;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderIds } = body as { orderIds: number[] };

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds array is required" },
        { status: 400 }
      );
    }

    // Pre-load reference data once
    const cities = await getNaqelCityCodes();
    const ccMap = await getCountryCurrencyMap(cities);

    const results: BulkResult[] = [];

    for (const orderId of orderIds) {
      const result: BulkResult = {
        orderId,
        orderNumber: "",
        status: "error",
      };

      try {
        // 1. Fetch WC order
        const wooOrder = await getOrder(orderId);
        result.orderNumber = wooOrder.number;

        // 2. Check carrier from WC meta
        const carrierMeta = (wooOrder.meta_data || []).find(
          (m: { key: string; value: string }) => m.key === "bzrc_carrier"
        );
        const carrier = carrierMeta?.value?.toLowerCase() || "";
        if (!carrier) {
          result.status = "skipped";
          result.error = "No carrier set (bzrc_carrier missing)";
          results.push(result);
          continue;
        }

        // 3. Check for existing shipment (prevent duplicates)
        const existing = await listShipments({
          woo_order_id: orderId,
          limit: 10,
        });
        const activeShipment = existing.find(
          (s) =>
            s.status !== "submit_failed" &&
            s.status !== "failed" &&
            s.status !== "cancelled"
        );
        if (activeShipment) {
          result.status = "skipped";
          result.shipmentId = activeShipment.id;
          result.awb = activeShipment.airwaybill_number || undefined;
          result.error = `Shipment #${activeShipment.id} already exists (${activeShipment.status})`;
          results.push(result);
          continue;
        }
        // Track old failed shipments for auto-cleanup after success
        const oldFailed = existing.filter(
          (s) => s.status === "submit_failed" || s.status === "failed"
        );

        // 4. Validate exit route
        const destCountry = (
          wooOrder.shipping?.country ||
          wooOrder.billing?.country ||
          ""
        ).toUpperCase();
        const shipperCountry = "TR"; // Default origin
        const exitRoute = await getExitLocation(shipperCountry, destCountry);
        if (!exitRoute) {
          result.status = "skipped";
          result.error = `No exit route for ${shipperCountry} → ${destCountry}`;
          results.push(result);
          continue;
        }

        // 4b. SMSA country restriction
        if (carrier === "smsa") {
          const SMSA_COUNTRIES = new Set(["SA","BH","EG","KW","AE","JO","OM","QA","ZA","US"]);
          if (!SMSA_COUNTRIES.has(destCountry)) {
            result.status = "skipped";
            result.error = `SMSA does not support destination ${destCountry}. Supported: SA, BH, EG, KW, AE, JO, OM, QA, ZA, US`;
            results.push(result);
            continue;
          }
        }

        // 5. City match: use saved bzrc_city_code or auto-match
        const savedCityCode = (wooOrder.meta_data || []).find(
          (m: { key: string; value: string }) => m.key === "bzrc_city_code"
        )?.value;
        let cityCode = savedCityCode || "";
        let countryCurrency =
          (wooOrder.meta_data || []).find(
            (m: { key: string; value: string }) =>
              m.key === "bzrc_country_currency"
          )?.value || "";

        if (!cityCode) {
          const cityName =
            wooOrder.shipping?.city || wooOrder.billing?.city || "";
          if (!cityName) {
            result.status = "skipped";
            result.error = "No city in order address";
            results.push(result);
            continue;
          }
          const cityResult = await matchCity(destCountry, cityName, cities);
          if (
            cityResult.confidence === "none" ||
            !cityResult.matchedCity
          ) {
            result.status = "skipped";
            result.error = `City match failed for "${cityName}" in ${destCountry} (confidence: ${cityResult.confidence})`;
            results.push(result);
            continue;
          }
          cityCode = cityResult.matchedCity.cityCode;
          if (!countryCurrency) {
            countryCurrency =
              cityResult.matchedCity.countryCurrency || "";
          }
        }

        // Use country→currency map as primary source
        if (!countryCurrency) {
          countryCurrency = ccMap[destCountry] || "";
        }

        // 6. Currency conversion
        let convertedTotal: number | undefined;
        const orderTotal = Number(wooOrder.total);
        if (
          countryCurrency &&
          wooOrder.currency !== countryCurrency &&
          orderTotal > 0
        ) {
          const converted = await convertCurrency(
            wooOrder.currency,
            countryCurrency,
            orderTotal
          );
          if (converted != null) {
            convertedTotal = converted;
          } else {
            // Conversion failed (unsupported currency) — fall back to order currency
            countryCurrency = wooOrder.currency;
          }
        }

        // 7. Get carrier config for declared value multiplier (COD)
        let declaredValueMultiplier: number | undefined;
        if (wooOrder.payment_method === "cod") {
          const carrierCfg = await getCarrierConfig(carrier);
          if (carrierCfg) {
            declaredValueMultiplier = carrierCfg.declaredValueMultiplier;
          }
        }

        // 8. Map to shipment payload (order already translated at fetch time)
        const payload = mapWooOrderToShipment(wooOrder, {
          cityCode,
          countryCurrency: countryCurrency || undefined,
          convertedTotal,
          declaredValueMultiplier,
        });

        // 9. Create shipment in DB
        const shipment = await createShipment(payload);
        result.shipmentId = shipment.id;

        // 10. Submit to carrier
        const submitted = await submitShipment(shipment.id);
        result.status = "success";
        result.awb = submitted.airwaybill_number || undefined;
        result.shipmentId = submitted.id;

        // Write AWB to WooCommerce order meta
        if (submitted.airwaybill_number) {
          try {
            await updateOrder(orderId, {
              meta_data: [
                { key: "_bzrc_naqel_awb", value: submitted.airwaybill_number },
              ],
            });
          } catch {
            // Non-fatal
          }
        }

        if (submitted.status === "submit_failed") {
          result.status = "error";
          result.error =
            submitted.status_message || "Submit failed at carrier";
        } else {
          // Auto-cleanup: cancel old failed shipments for this order
          for (const old of oldFailed) {
            try {
              await updateShipment(old.id, {
                status: "cancelled",
                status_message: `Superseded by shipment #${submitted.id}`,
              } as Record<string, unknown>);
            } catch {
              // Non-fatal
            }
          }
        }
      } catch (err) {
        result.status = "error";
        result.error =
          err instanceof Error ? err.message : "Unknown error";
      }

      results.push(result);
    }

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Bulk submit failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
