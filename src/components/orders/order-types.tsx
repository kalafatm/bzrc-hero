// ── Shared types, constants, and helpers for Orders ──────────

export interface WooAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface WooLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  total: string;
  sku: string;
  price: number;
}

export interface WooMeta {
  id: number;
  key: string;
  value: string;
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  date_created: string;
  total: string;
  shipping_total: string;
  discount_total: string;
  payment_method: string;
  payment_method_title: string;
  customer_note: string;
  billing: WooAddress;
  shipping: WooAddress;
  line_items: WooLineItem[];
  meta_data?: WooMeta[];
}

export interface CityMatchResult {
  confidence: "exact" | "fuzzy" | "gemini" | "none";
  matchedCity: {
    countryCode: string;
    cityEN: string;
    cityAR: string;
    cityCode: string;
    countryCurrency: string;
  } | null;
  smsaCity?: string | null;
  score: number;
  alternatives: { city: { cityEN: string; cityCode: string }; score: number }[];
  smsaAlternatives?: { cityName: string; score: number }[];
  originalInput: string;
  carrier?: string;
}

export interface BulkResults {
  summary: { total: number; success: number; skipped: number; errors: number };
  results: {
    orderId: number;
    orderNumber: string;
    status: string;
    shipmentId?: number;
    awb?: string;
    error?: string;
  }[];
}

export const CARRIERS = [
  { value: "naqel", label: "Naqel" },
  { value: "smsa", label: "SMSA" },
  { value: "dhl", label: "DHL Express" },
] as { value: string; label: string; disabled?: boolean }[];

export const WC_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  "on-hold": "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
  nqlrdysbmt: "bg-indigo-100 text-indigo-700",
  dhlrdysbmt: "bg-cyan-100 text-cyan-700",
  smsardysbmt: "bg-teal-100 text-teal-700",
};

export const WC_STATUSES = [
  "nqlrdysbmt",
  "processing",
  "on-hold",
  "completed",
  "dhlrdysbmt",
  "smsardysbmt",
  "pending",
  "cancelled",
  "refunded",
  "failed",
];

export const CONFIDENCE_COLORS: Record<string, string> = {
  exact: "bg-green-100 text-green-700",
  fuzzy: "bg-yellow-100 text-yellow-700",
  gemini: "bg-orange-100 text-orange-700",
  none: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = WC_STATUS_COLORS[status] || "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

export function hasNonLatin(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u4E00-\u9FFF]/.test(
    text
  );
}

export function getCarrierFromMeta(meta?: WooMeta[]): string {
  if (!meta) return "";
  const carrier = meta.find((m) => m.key === "bzrc_carrier");
  return carrier?.value?.toLowerCase() || "";
}

export function getMetaValue(meta: WooMeta[] | undefined, key: string): string {
  if (!meta) return "";
  return meta.find((m) => m.key === key)?.value || "";
}

export function isRouteValid(order: WooOrder, validDests: Set<string>): boolean {
  const destCountry = (order.shipping.country || order.billing.country || "").toUpperCase();
  if (!destCountry) return false;
  return validDests.has(destCountry);
}
