import { NextRequest, NextResponse } from "next/server";
import { getSheetData, updateCarrierConfig } from "@/lib/api/google-sheets";
import type { CarrierConfigRow } from "@/lib/api/google-sheets";

/**
 * GET /api/settings/carrier-config — read carrier configs from Google Sheets
 * PUT /api/settings/carrier-config — update carrier configs in Google Sheets
 */

export async function GET() {
  try {
    const data = await getSheetData();
    return NextResponse.json({ configs: data.carrierConfigs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load carrier config";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { configs } = (await req.json()) as { configs: CarrierConfigRow[] };

    if (!Array.isArray(configs) || configs.length === 0) {
      return NextResponse.json({ error: "configs array is required" }, { status: 400 });
    }

    // Validate each config
    for (const c of configs) {
      if (!c.carrierCode || !c.carrierName) {
        return NextResponse.json({ error: "carrierCode and carrierName are required" }, { status: 400 });
      }
      if (typeof c.declaredValueMultiplier !== "number" || c.declaredValueMultiplier < 0 || c.declaredValueMultiplier > 10) {
        return NextResponse.json({ error: `Invalid multiplier for ${c.carrierCode}: must be 0-10` }, { status: 400 });
      }
    }

    await updateCarrierConfig(configs);

    // Re-read to confirm
    const data = await getSheetData(true);
    return NextResponse.json({ configs: data.carrierConfigs, message: "Carrier config updated" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update carrier config";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
