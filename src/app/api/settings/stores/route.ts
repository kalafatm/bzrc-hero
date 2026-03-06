import { NextResponse } from "next/server";
import { getStores } from "@/config/stores";

/**
 * GET /api/settings/stores — list available WC stores
 * Returns store id, name, active status (never exposes credentials)
 */
export async function GET() {
  const stores = getStores().map((s) => ({
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl ? s.baseUrl.replace(/https?:\/\//, "").replace(/\/+$/, "") : "",
    active: s.active,
  }));
  return NextResponse.json({ stores });
}
