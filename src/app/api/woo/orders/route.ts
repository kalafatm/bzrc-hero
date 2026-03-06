import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/api/woo-client";
import { translateWooOrder } from "@/lib/api/gemini";

/**
 * Translate orders with concurrency limit to avoid Gemini API timeouts.
 * Failed translations silently return the original order.
 */
async function translateWithLimit(
  orders: Awaited<ReturnType<typeof getOrders>>["orders"],
  concurrency = 3
) {
  const results = [...orders];
  let cursor = 0;

  async function next(): Promise<void> {
    const idx = cursor++;
    if (idx >= orders.length) return;
    try {
      results[idx] = await translateWooOrder(orders[idx]);
    } catch {
      // Keep original order on failure
    }
    return next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, orders.length) }, () => next()));
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = parseInt(sp.get("page") || "1", 10);
    const per_page = parseInt(sp.get("per_page") || "50", 10);
    const status = sp.get("status") || undefined;

    const store = sp.get("store") || undefined;

    const { orders, totalPages, total } = await getOrders({
      page,
      per_page,
      status,
      storeId: store,
    });

    // Auto-translate Arabic/non-Latin fields (3 concurrent max to avoid Gemini timeouts)
    const translatedOrders = await translateWithLimit(orders, 3);

    return NextResponse.json({ orders: translatedOrders, totalPages, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch orders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
