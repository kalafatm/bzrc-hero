import { NextRequest, NextResponse } from "next/server";
import { matchCity } from "@/lib/api/city-matcher";
import { getNaqelCityCodes } from "@/lib/api/google-sheets";

/**
 * POST /api/city-match — run city code fuzzy matching
 * Body: { countryCode: string, cityName: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { countryCode, cityName } = await req.json();

    if (!countryCode || !cityName) {
      return NextResponse.json(
        { error: "countryCode and cityName are required" },
        { status: 400 }
      );
    }

    const cities = await getNaqelCityCodes();
    const result = await matchCity(countryCode, cityName, cities);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "City matching failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
