import { NextRequest, NextResponse } from "next/server";
import { matchCity, matchSmsaCity } from "@/lib/api/city-matcher";
import { getNaqelCityCodes } from "@/lib/api/google-sheets";

/**
 * POST /api/city-match — run city code fuzzy matching
 * Body: { countryCode: string, cityName: string, carrier?: string }
 *
 * Both carriers use Naqel's 4,449-row city list for matching.
 * SMSA: returns cityEN as the city name (SMSA accepts free-text)
 * Naqel: returns cityCode for the carrier API
 */
export async function POST(req: NextRequest) {
  try {
    const { countryCode, cityName, carrier } = await req.json();

    if (!cityName) {
      return NextResponse.json(
        { error: "cityName is required" },
        { status: 400 }
      );
    }

    if (!countryCode) {
      return NextResponse.json(
        { error: "countryCode is required" },
        { status: 400 }
      );
    }

    const cities = await getNaqelCityCodes();

    if (carrier === "smsa") {
      // SMSA: match using Naqel city list, return cityEN as the SMSA city name
      const result = await matchSmsaCity(countryCode, cityName, cities);
      return NextResponse.json(result);
    }

    // Naqel (default)
    const result = await matchCity(countryCode, cityName, cities);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "City matching failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
