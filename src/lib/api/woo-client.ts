import type { WooOrder, WooProduct, WooListParams } from "./woo-types";
import { getActiveStore } from "@/config/stores";

function buildUrl(endpoint: string, params?: Record<string, string>, storeId?: string): string {
  const store = getActiveStore(storeId);
  const base = store.baseUrl.replace(/\/+$/, "");
  const url = new URL(`/wp-json/wc/v3/${endpoint}`, base);
  url.searchParams.set("consumer_key", store.consumerKey);
  url.searchParams.set("consumer_secret", store.consumerSecret);
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
  params?: Record<string, string>,
  storeId?: string
): Promise<{ data: T; totalPages: number; total: number }> {
  const url = buildUrl(endpoint, params, storeId);
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
  params?: WooListParams & { storeId?: string; lang?: string }
): Promise<{ orders: WooOrder[]; totalPages: number; total: number }> {
  const qp: Record<string, string> = {
    per_page: String(params?.per_page ?? 50),
    page: String(params?.page ?? 1),
    orderby: params?.orderby ?? "date",
    order: params?.order ?? "desc",
    lang: params?.lang ?? "all",
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
    qp,
    params?.storeId
  );
  return { orders: data, totalPages, total };
}

export async function getOrder(orderId: number, storeId?: string, lang?: string): Promise<WooOrder> {
  const { data } = await wooRequest<WooOrder>(`orders/${orderId}`, { lang: lang ?? "en" }, storeId);
  return data;
}

/**
 * Update a WooCommerce order (PUT /orders/{id}).
 * Only send changed fields — WC merges with existing data.
 */
export async function getProductsByIds(
  productIds: number[],
  storeId?: string,
  lang?: string
): Promise<WooProduct[]> {
  if (productIds.length === 0) return [];
  const params: Record<string, string> = {
    include: productIds.join(","),
    per_page: String(Math.min(productIds.length, 100)),
  };
  if (lang) params.lang = lang;
  const { data } = await wooRequest<WooProduct[]>("products", params, storeId);
  return data;
}

export async function updateOrder(
  orderId: number,
  updateData: Record<string, unknown>,
  storeId?: string
): Promise<WooOrder> {
  const url = buildUrl(`orders/${orderId}`, undefined, storeId);
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
