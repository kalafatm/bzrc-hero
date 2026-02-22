import type { WooOrder, WooListParams } from "./woo-types";

const WOO_BASE_URL = process.env.WOO_BASE_URL!;
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY!;
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET!;

function buildUrl(endpoint: string, params?: Record<string, string>): string {
  const base = WOO_BASE_URL.replace(/\/+$/, "");
  const url = new URL(`/wp-json/wc/v3/${endpoint}`, base);
  url.searchParams.set("consumer_key", WOO_CONSUMER_KEY);
  url.searchParams.set("consumer_secret", WOO_CONSUMER_SECRET);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

async function wooRequest<T>(
  endpoint: string,
  params?: Record<string, string>
): Promise<{ data: T; totalPages: number; total: number }> {
  const url = buildUrl(endpoint, params);
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `WooCommerce API error: ${res.status} ${res.statusText} — ${body.substring(0, 200)}`
    );
  }

  const data = (await res.json()) as T;
  const totalPages = parseInt(res.headers.get("x-wp-totalpages") ?? "1", 10);
  const total = parseInt(res.headers.get("x-wp-total") ?? "0", 10);
  return { data, totalPages, total };
}

export async function getOrders(
  params?: WooListParams
): Promise<{ orders: WooOrder[]; totalPages: number; total: number }> {
  const qp: Record<string, string> = {
    per_page: String(params?.per_page ?? 50),
    page: String(params?.page ?? 1),
    orderby: params?.orderby ?? "date",
    order: params?.order ?? "desc",
  };
  if (params?.status) {
    qp.status = Array.isArray(params.status)
      ? params.status.join(",")
      : params.status;
  }
  if (params?.after) qp.after = params.after;
  if (params?.modified_after) qp.modified_after = params.modified_after;

  const { data, totalPages, total } = await wooRequest<WooOrder[]>(
    "orders",
    qp
  );
  return { orders: data, totalPages, total };
}

export async function getOrder(orderId: number): Promise<WooOrder> {
  const { data } = await wooRequest<WooOrder>(`orders/${orderId}`);
  return data;
}

/**
 * Update a WooCommerce order (PUT /orders/{id}).
 * Only send changed fields — WC merges with existing data.
 */
export async function updateOrder(
  orderId: number,
  updateData: Record<string, unknown>
): Promise<WooOrder> {
  const url = buildUrl(`orders/${orderId}`);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updateData),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `WooCommerce API error: ${res.status} ${res.statusText} — ${body.substring(0, 200)}`
    );
  }

  return (await res.json()) as WooOrder;
}
