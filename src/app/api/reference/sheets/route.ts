import { NextRequest, NextResponse } from "next/server";
import { getSheetData } from "@/lib/api/google-sheets";

/**
 * GET /api/reference/sheets — returns cached Google Sheets reference data
 * Query: ?refresh=true to force refresh cache
 */
export async function GET(req: NextRequest) {
  try {
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";
    const data = await getSheetData(forceRefresh);

    return NextResponse.json({
      exitLocations: data.exitLocations,
      naqelCityCodes: data.naqelCityCodes,
      currencyCodes: data.currencyCodes,
      carrierConfigs: data.carrierConfigs,
      fetchedAt: data.fetchedAt,
      counts: {
        exitLocations: data.exitLocations.length,
        naqelCityCodes: data.naqelCityCodes.length,
        currencyCodes: data.currencyCodes.length,
        carrierConfigs: data.carrierConfigs.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch sheet data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
