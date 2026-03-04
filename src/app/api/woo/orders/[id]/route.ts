import { NextRequest, NextResponse } from "next/server";
import { getOrder, updateOrder } from "@/lib/api/woo-client";
import { translateWooOrder } from "@/lib/api/gemini";

/**
 * GET /api/woo/orders/[id] — get single WC order
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await getOrder(parseInt(id, 10));
    const translated = await translateWooOrder(order);
    return NextResponse.json({ order: translated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/woo/orders/[id] — update WC order fields
 * Body: partial WC order data (shipping, billing, line_items, etc.)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateOrder(parseInt(id, 10), body);
    return NextResponse.json({ order: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
