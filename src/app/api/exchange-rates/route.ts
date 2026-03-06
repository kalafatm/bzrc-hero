import { NextRequest, NextResponse } from "next/server";

// Exchange rates are on the shipping service (port 8001), not proxied through LiteSpeed
const SHIPPING_API_URL =
  process.env.SHIPPING_API_INTERNAL_URL || process.env.SHIPPING_API_URL || "https://dev.bazaarica.com";

/**
 * GET /api/exchange-rates — proxy to backend TCMB-based exchange rates
 * Query: ?from=USD&to=SAR&amount=76.66
 * Returns: { from, to, amount, converted_amount }
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = (sp.get("from") || "USD").toUpperCase();
    const to = sp.get("to")?.toUpperCase();
    const amountStr = sp.get("amount");

    if (!to || !amountStr) {
      // List all rates
      const res = await fetch(`${SHIPPING_API_URL}/exchange-rates/`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Exchange rate API: ${res.status}`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const res = await fetch(
      `${SHIPPING_API_URL}/exchange-rates/convert?amount=${amount}&from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    const data = await res.json();
    // Map backend response to frontend expected shape
    return NextResponse.json({
      from: data.from,
      to: data.to,
      amount: data.amount,
      rate: data.converted / data.amount,
      converted_amount: data.converted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Exchange rate fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
