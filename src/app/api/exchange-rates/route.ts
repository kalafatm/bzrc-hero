import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/exchange-rates — currency conversion using free open exchange rate API
 * Query: ?from=USD&to=JOD&amount=76.66
 * Returns: { from, to, amount, rate, converted_amount }
 *
 * Uses https://open.er-api.com (free, no API key, updates daily)
 * Cached in-memory for 1 hour.
 */

// In-memory rate cache: baseCurrency -> { rates, fetchedAt }
const rateCache = new Map<string, { rates: Record<string, number>; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getRates(baseCurrency: string): Promise<Record<string, number>> {
  const now = Date.now();
  const cached = rateCache.get(baseCurrency);

  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return cached.rates;
  }

  const res = await fetch(
    `https://open.er-api.com/v6/latest/${baseCurrency}`,
    { signal: AbortSignal.timeout(10_000) }
  );

  if (!res.ok) {
    throw new Error(`Exchange rate API error: ${res.status}`);
  }

  const data = (await res.json()) as { rates: Record<string, number> };
  rateCache.set(baseCurrency, { rates: data.rates, fetchedAt: now });
  return data.rates;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = (sp.get("from") || "USD").toUpperCase();
    const to = sp.get("to")?.toUpperCase();
    const amountStr = sp.get("amount");

    if (!to || !amountStr) {
      // List all rates for the base currency
      const rates = await getRates(from);
      return NextResponse.json({ base: from, rates });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const rates = await getRates(from);
    const rate = rates[to];

    if (rate == null) {
      return NextResponse.json(
        { error: `No rate found for ${from} → ${to}` },
        { status: 404 }
      );
    }

    const converted_amount = Math.round(amount * rate * 100) / 100;

    return NextResponse.json({
      from,
      to,
      amount,
      rate,
      converted_amount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Exchange rate fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
