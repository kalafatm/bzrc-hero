import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/api/woo-client";
import { translateWooOrder } from "@/lib/api/gemini";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = parseInt(sp.get("page") || "1", 10);
    const per_page = parseInt(sp.get("per_page") || "50", 10);
    const status = sp.get("status") || undefined;

    const { orders, totalPages, total } = await getOrders({
      page,
      per_page,
      status,
    });

    // Auto-translate Arabic/non-Latin fields (names → transliterate, addresses → translate)
    const translatedOrders = await Promise.all(
      orders.map((o) => translateWooOrder(o))
    );

    return NextResponse.json({ orders: translatedOrders, totalPages, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch orders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
