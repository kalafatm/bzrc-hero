import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/api/woo-client";

/**
 * GET /api/woo/products/prices?ids=1,2,3
 * Returns regular_price (list price) for each product ID.
 * Used by commercial invoice to distribute declared value proportionally.
 */
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "Missing ids param" }, { status: 400 });
  }

  const productIds = ids
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);

  if (productIds.length === 0) {
    return NextResponse.json({ error: "No valid product IDs" }, { status: 400 });
  }

  try {
    const products = await getProductsByIds(productIds, undefined, "en");
    const prices: Record<
      string,
      { regular_price: string; price: string; name: string; sku: string }
    > = {};
    for (const p of products) {
      prices[String(p.id)] = {
        regular_price: p.regular_price,
        price: p.price,
        name: p.name,
        sku: p.sku,
      };
    }
    return NextResponse.json({ prices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch products";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
