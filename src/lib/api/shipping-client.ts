import type {
  ShipmentCreate,
  ShipmentRead,
  ShipmentListParams,
  TrackingResponse,
  BulkTrackingResult,
} from "./shipping-types";

const SHIPPING_API_URL =
  process.env.SHIPPING_API_URL || "http://135.181.215.44";

class ShippingApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody: string
  ) {
    super(message);
    this.name = "ShippingApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SHIPPING_API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ShippingApiError(
      `Shipping API error: ${res.status} ${res.statusText}`,
      res.status,
      body
    );
  }

  return res.json() as Promise<T>;
}

// ── CRUD ──────────────────────────────────────────────────────

export async function createShipment(
  data: ShipmentCreate
): Promise<ShipmentRead> {
  return request<ShipmentRead>("/shipments/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listShipments(
  params?: ShipmentListParams
): Promise<ShipmentRead[]> {
  const qs = new URLSearchParams();
  if (params?.status_filter) qs.set("status_filter", params.status_filter);
  if (params?.woo_order_id != null)
    qs.set("woo_order_id", String(params.woo_order_id));
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));

  const query = qs.toString();
  return request<ShipmentRead[]>(`/shipments/?${query}`);
}

export async function getShipment(id: number): Promise<ShipmentRead> {
  return request<ShipmentRead>(`/shipments/${id}`);
}

export async function updateShipment(
  id: number,
  data: Partial<ShipmentCreate>
): Promise<ShipmentRead> {
  return request<ShipmentRead>(`/shipments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function submitShipment(id: number): Promise<ShipmentRead> {
  return request<ShipmentRead>(`/shipments/${id}/submit`, {
    method: "POST",
  });
}

// ── Tracking ─────────────────────────────────────────────────

export async function trackShipment(id: number): Promise<TrackingResponse> {
  return request<TrackingResponse>(`/shipments/${id}/track`, {
    method: "POST",
  });
}

export async function getTrackingEvents(id: number): Promise<TrackingResponse> {
  return request<TrackingResponse>(`/shipments/${id}/tracking-events`);
}

export async function pollAllTracking(): Promise<BulkTrackingResult> {
  return request<BulkTrackingResult>(`/shipments/tracking/poll`, {
    method: "POST",
  });
}

export { ShippingApiError };
