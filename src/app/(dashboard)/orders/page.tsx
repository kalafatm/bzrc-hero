"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  Truck,
  Languages,
  MapPin,
  Save,
  Download,
  Check,
  AlertTriangle,
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

interface WooAddress {
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

interface WooLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  total: string;
  sku: string;
  price: number;
}

interface WooMeta {
  id: number;
  key: string;
  value: string;
}

interface WooOrder {
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

interface CityMatchResult {
  confidence: "exact" | "fuzzy" | "gemini" | "none";
  matchedCity: {
    countryCode: string;
    cityEN: string;
    cityAR: string;
    cityCode: string;
    countryCurrency: string;
  } | null;
  score: number;
  alternatives: { city: { cityEN: string; cityCode: string }; score: number }[];
  originalInput: string;
}

// ── Constants ──────────────────────────────────────────────────

const CARRIERS = [
  { value: "naqel", label: "Naqel" },
  { value: "smsa", label: "SMSA" },
  { value: "dhl", label: "DHL (coming soon)", disabled: true },
];

const WC_STATUS_COLORS: Record<string, string> = {
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

const WC_STATUSES = [
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

const CONFIDENCE_COLORS: Record<string, string> = {
  exact: "bg-green-100 text-green-700",
  fuzzy: "bg-yellow-100 text-yellow-700",
  gemini: "bg-orange-100 text-orange-700",
  none: "bg-red-100 text-red-700",
};

// ── Helpers ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls = WC_STATUS_COLORS[status] || "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function hasNonLatin(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u4E00-\u9FFF]/.test(text);
}

function getCarrierFromMeta(meta?: WooMeta[]): string {
  if (!meta) return "";
  const carrier = meta.find((m) => m.key === "bzrc_carrier");
  return carrier?.value?.toLowerCase() || "";
}

function getMetaValue(meta: WooMeta[] | undefined, key: string): string {
  if (!meta) return "";
  return meta.find((m) => m.key === key)?.value || "";
}

function isRouteValid(order: WooOrder, validDests: Set<string>): boolean {
  const destCountry = (order.shipping.country || order.billing.country || "").toUpperCase();
  if (!destCountry) return false;
  return validDests.has(destCountry);
}

// ── Editable Address Component ─────────────────────────────────

function AddressEditor({
  address,
  onChange,
  prefix,
  onTranslate,
  translating,
}: {
  address: WooAddress;
  onChange: (field: keyof WooAddress, value: string) => void;
  prefix: string;
  onTranslate: (fields: Record<string, string>) => void;
  translating: boolean;
}) {
  const fields: { key: keyof WooAddress; label: string; half?: boolean }[] = [
    { key: "first_name", label: "First Name", half: true },
    { key: "last_name", label: "Last Name", half: true },
    { key: "company", label: "Company" },
    { key: "address_1", label: "Address Line 1" },
    { key: "address_2", label: "Address Line 2" },
    { key: "city", label: "City", half: true },
    { key: "state", label: "State", half: true },
    { key: "postcode", label: "Postcode", half: true },
    { key: "country", label: "Country (ISO2)", half: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
  ];

  const hasTranslatable = Object.values(address).some(
    (v) => typeof v === "string" && hasNonLatin(v)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{prefix}</p>
        {hasTranslatable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const toTranslate: Record<string, string> = {};
              for (const f of fields) {
                const val = address[f.key];
                if (typeof val === "string" && hasNonLatin(val)) {
                  toTranslate[f.key] = val;
                }
              }
              onTranslate(toTranslate);
            }}
            disabled={translating}
          >
            <Languages className="size-3.5" />
            {translating ? "Translating..." : "Translate"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <div key={f.key} className={f.half ? "" : "col-span-2"}>
            <Label className="text-xs text-muted-foreground">{f.label}</Label>
            <Input
              value={address[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className={`h-8 text-sm ${
                typeof address[f.key] === "string" && hasNonLatin(address[f.key] || "")
                  ? "border-orange-300 bg-orange-50"
                  : ""
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("nqlrdysbmt");
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  // Bulk submit state
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<{
    summary: { total: number; success: number; skipped: number; errors: number };
    results: { orderId: number; orderNumber: string; status: string; shipmentId?: number; awb?: string; error?: string }[];
  } | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Shipment existence tracking
  const [orderShipmentMap, setOrderShipmentMap] = useState<Record<number, string>>({}); // orderId -> shipment status

  // Detail dialog
  const [detailOrder, setDetailOrder] = useState<WooOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editedShipping, setEditedShipping] = useState<WooAddress | null>(null);
  const [editedBilling, setEditedBilling] = useState<WooAddress | null>(null);
  const [editedNote, setEditedNote] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState("");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  // City match state
  const [cityMatch, setCityMatch] = useState<CityMatchResult | null>(null);
  const [matchingCity, setMatchingCity] = useState(false);
  const [manualCityCode, setManualCityCode] = useState("");

  // Route validation state
  const [validDestinations, setValidDestinations] = useState<Set<string>>(new Set());
  const [exitDataLoaded, setExitDataLoaded] = useState(false);
  const [routeFilter, setRouteFilter] = useState<"all" | "valid" | "invalid">("all");

  // Country → currency map (from naqelCityCodes)
  const [countryCurrencyMap, setCountryCurrencyMap] = useState<Record<string, string>>({});

  // Track original for diff
  const originalOrderRef = useRef<WooOrder | null>(null);

  // ── Check shipments for displayed orders ────────────────

  const checkShipmentsForOrders = async () => {
    try {
      // Fetch recent shipments and build a map of woo_order_id -> status
      const res = await fetch("/api/shipments?limit=200");
      const json = await res.json();
      if (json.shipments) {
        const map: Record<number, string> = {};
        for (const s of json.shipments) {
          if (s.woo_order_id) {
            // Keep the most relevant status (submitted > created)
            if (!map[s.woo_order_id] || s.status === "submitted" || s.status === "in_transit" || s.status === "delivered") {
              map[s.woo_order_id] = s.status;
            }
          }
        }
        setOrderShipmentMap(map);
      }
    } catch {
      // Silent fail — not critical
    }
  };

  // ── Orders cache (sessionStorage, per filter+page) ───────
  const cacheKey = (filter: string, p: number) => `bzrc_orders_${filter}_p${p}`;

  const saveToCache = (filter: string, p: number, data: { orders: WooOrder[]; totalPages: number; total: number }) => {
    try {
      sessionStorage.setItem(cacheKey(filter, p), JSON.stringify({ ...data, ts: Date.now() }));
    } catch { /* storage full — ignore */ }
  };

  const loadFromCache = (filter: string, p: number): { orders: WooOrder[]; totalPages: number; total: number } | null => {
    try {
      const raw = sessionStorage.getItem(cacheKey(filter, p));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > 5 * 60 * 1000) return null;
      return cached;
    } catch { return null; }
  };

  // ── Fetch Orders ────────────────────────────────────────

  const fetchOrders = useCallback(
    async (p: number, forceRefresh = false) => {
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        const cached = loadFromCache(statusFilter, p);
        if (cached) {
          setOrders(cached.orders);
          setTotalPages(cached.totalPages);
          setTotal(cached.total);
          setPage(p);
          setLastSynced("cached");
          checkShipmentsForOrders();
          return;
        }
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          per_page: "50",
        });
        if (statusFilter !== "all") params.set("status", statusFilter);

        const res = await fetch(`/api/woo/orders?${params}`);
        const json = await res.json();
        if (json.error) {
          toast.error(json.error);
        } else {
          const fetchedOrders: WooOrder[] = json.orders || [];
          setOrders(fetchedOrders);
          setTotalPages(json.totalPages || 1);
          setTotal(json.total || 0);
          setPage(p);
          setLastSynced(new Date().toLocaleTimeString());

          // Save to cache
          saveToCache(statusFilter, p, {
            orders: fetchedOrders,
            totalPages: json.totalPages || 1,
            total: json.total || 0,
          });

          // Check which orders already have shipments
          checkShipmentsForOrders();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch orders");
      }
      setLoading(false);
    },
    [statusFilter]
  );

  // Load from cache or fetch on first mount
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      fetchOrders(1); // will use cache if available
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filter changes (use cache if available, else fetch)
  useEffect(() => {
    if (lastSynced) {
      fetchOrders(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Fetch reference data: exit locations + country currencies
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/reference/sheets");
        const json = await res.json();
        if (json.exitLocations) {
          const validDests = new Set<string>();
          for (const row of json.exitLocations) {
            if ((row.exitCountry || "").toUpperCase() === "TR") {
              validDests.add((row.destinationCountry || "").toUpperCase());
            }
          }
          setValidDestinations(validDests);
          setExitDataLoaded(true);
        }
        // Build country → currency map from naqelCityCodes
        if (json.naqelCityCodes) {
          const ccMap: Record<string, string> = {};
          for (const row of json.naqelCityCodes) {
            const cc = (row.countryCode || "").toUpperCase();
            const cur = (row.countryCurrency || "").toUpperCase();
            if (cc && cur && !ccMap[cc]) {
              ccMap[cc] = cur;
            }
          }
          setCountryCurrencyMap(ccMap);
        }
      } catch {
        // Silent fail — route validation is non-blocking
      }
    })();
  }, []);

  // ── Open detail dialog ───────────────────────────────────

  const openDetail = (order: WooOrder) => {
    setDetailOrder(order);
    setEditedShipping({ ...order.shipping });
    setEditedBilling({ ...order.billing });
    setEditedNote(order.customer_note || "");
    setSelectedCarrier(getCarrierFromMeta(order.meta_data));
    setCityMatch(null);
    // Pre-populate city code from WC meta if previously saved
    const savedCityCode = getMetaValue(order.meta_data, "bzrc_city_code");
    setManualCityCode(savedCityCode);
    originalOrderRef.current = order;
    setDetailOpen(true);

    // Auto-run city match if no saved city code and city+country available
    const city = order.shipping.city || order.billing.city;
    const country = order.shipping.country || order.billing.country;
    if (!savedCityCode && city && country) {
      autoMatchCity(country, city);
    }
  };

  // Auto city match (silent, no toast on start)
  const autoMatchCity = async (countryCode: string, cityName: string) => {
    setMatchingCity(true);
    try {
      const res = await fetch("/api/city-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, cityName }),
      });
      const json = await res.json();
      if (!json.error) {
        setCityMatch(json as CityMatchResult);
        if (json.confidence === "exact") {
          toast.success(`City matched: ${json.matchedCity?.cityEN} → ${json.matchedCity?.cityCode}`);
        } else if (json.confidence !== "none") {
          toast.info(`City ${json.confidence} match: ${json.matchedCity?.cityEN} (${Math.round(json.score * 100)}%)`);
        }
      }
    } catch {
      // Silent fail — user can still match manually
    }
    setMatchingCity(false);
  };

  // ── Translation ──────────────────────────────────────────

  const handleTranslate = async (
    fields: Record<string, string>,
    target: "shipping" | "billing"
  ) => {
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`Translation failed: ${json.error}`);
      } else if (json.translations) {
        const setter = target === "shipping" ? setEditedShipping : setEditedBilling;
        setter((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };
          for (const [key, value] of Object.entries(json.translations)) {
            (updated as Record<string, string>)[key] = value as string;
          }
          return updated;
        });
        toast.success("Fields translated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed");
    }
    setTranslating(false);
  };

  // ── City Code Matching ───────────────────────────────────

  const handleMatchCity = async () => {
    if (!editedShipping) return;
    setMatchingCity(true);
    try {
      const res = await fetch("/api/city-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: editedShipping.country,
          cityName: editedShipping.city,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`City match failed: ${json.error}`);
      } else {
        setCityMatch(json as CityMatchResult);
        if (json.confidence === "exact") {
          toast.success(`Exact match: ${json.matchedCity?.cityEN} (${json.matchedCity?.cityCode})`);
        } else if (json.confidence === "none") {
          toast.error("No city match found — please enter manually");
        } else {
          toast.info(
            `${json.confidence} match: ${json.matchedCity?.cityEN} (${Math.round(json.score * 100)}%) — please confirm`
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "City match failed");
    }
    setMatchingCity(false);
  };

  // ── Save to WooCommerce ──────────────────────────────────

  const handleSaveToWC = async () => {
    if (!detailOrder) return;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {};

      if (editedShipping && JSON.stringify(editedShipping) !== JSON.stringify(detailOrder.shipping)) {
        updateData.shipping = editedShipping;
      }
      if (editedBilling && JSON.stringify(editedBilling) !== JSON.stringify(detailOrder.billing)) {
        updateData.billing = editedBilling;
      }
      if (editedNote !== (detailOrder.customer_note || "")) {
        updateData.customer_note = editedNote;
      }

      // Always save carrier + city code + country currency to WC meta
      const currentCarrier = getCarrierFromMeta(detailOrder.meta_data);
      const currentCityCode = getMetaValue(detailOrder.meta_data, "bzrc_city_code");
      const currentCurrency = getMetaValue(detailOrder.meta_data, "bzrc_country_currency");
      const cityCode = manualCityCode || cityMatch?.matchedCity?.cityCode || "";
      const countryCurrency = cityMatch?.matchedCity?.countryCurrency || "";

      const metaUpdates: { key: string; value: string }[] = [];
      if (selectedCarrier !== currentCarrier) {
        metaUpdates.push({ key: "bzrc_carrier", value: selectedCarrier });
      }
      if (cityCode && cityCode !== currentCityCode) {
        metaUpdates.push({ key: "bzrc_city_code", value: cityCode });
      }
      if (countryCurrency && countryCurrency !== currentCurrency) {
        metaUpdates.push({ key: "bzrc_country_currency", value: countryCurrency });
      }
      if (metaUpdates.length > 0) {
        updateData.meta_data = metaUpdates;
      }

      if (Object.keys(updateData).length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/woo/orders/${detailOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`Save failed: ${json.error}`);
      } else {
        toast.success("Order saved to WooCommerce");
        if (json.order) {
          setDetailOrder(json.order);
          originalOrderRef.current = json.order;
          setEditedShipping({ ...json.order.shipping });
          setEditedBilling({ ...json.order.billing });
          setEditedNote(json.order.customer_note || "");
          // Update carrier from saved meta
          setSelectedCarrier(getCarrierFromMeta(json.order.meta_data));
          // Update order in the list too
          setOrders((prev) =>
            prev.map((o) => (o.id === json.order.id ? json.order : o))
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
    setSaving(false);
  };

  // ── Create Shipment ──────────────────────────────────────

  const handleCreateShipment = async () => {
    if (!detailOrder) return;

    if (!selectedCarrier) {
      toast.error("Select a carrier first");
      return;
    }

    if (!cityMatch?.matchedCity && !manualCityCode) {
      toast.error("Run city match or enter city code manually");
      return;
    }

    setCreating(true);
    try {
      // Determine target currency: country→currency map (reliable), fallback to city match
      const destCountry = (editedShipping?.country || detailOrder.shipping.country || detailOrder.billing.country || "").toUpperCase();
      const targetCurrency = countryCurrencyMap[destCountry] || cityMatch?.matchedCity?.countryCurrency;
      let convertedTotal: number | undefined;
      let convertedCurrency: string | undefined;

      // Convert currency if order is in different currency than destination
      if (targetCurrency && detailOrder.currency !== targetCurrency) {
        try {
          const rateRes = await fetch(
            `/api/exchange-rates?from=${detailOrder.currency}&to=${targetCurrency}&amount=${detailOrder.total}`
          );
          const rateJson = await rateRes.json();
          if (rateJson.converted_amount) {
            convertedTotal = rateJson.converted_amount;
            convertedCurrency = targetCurrency;
            toast.info(
              `Currency converted: ${detailOrder.total} ${detailOrder.currency} → ${convertedTotal!.toFixed(2)} ${targetCurrency}`
            );
          }
        } catch {
          // If conversion fails, proceed with original currency
          toast.warning("Currency conversion failed — using original currency");
        }
      }

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooOrderId: detailOrder.id,
          carrier: selectedCarrier,
          cityCode: manualCityCode || cityMatch?.matchedCity?.cityCode,
          countryCurrency: convertedCurrency || targetCurrency,
          convertedTotal,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        const shipmentId = json.shipment.id;
        toast.success(`Shipment #${shipmentId} created — submitting to carrier...`);

        // Auto-submit to carrier
        try {
          const submitRes = await fetch(`/api/shipments/${shipmentId}/submit`, {
            method: "POST",
          });
          const submitJson = await submitRes.json();
          if (submitJson.error) {
            toast.error(`Submit failed: ${submitJson.error}`);
            setOrderShipmentMap((prev) => ({ ...prev, [detailOrder.id]: "submit_failed" }));
          } else {
            const awb = submitJson.shipment?.airwaybill_number || "";
            toast.success(awb ? `Submitted! AWB: ${awb}` : "Submitted to carrier!");
            setOrderShipmentMap((prev) => ({
              ...prev,
              [detailOrder.id]: submitJson.shipment?.status || "submitted",
            }));
          }
        } catch {
          toast.error("Shipment created but submit to carrier failed");
          setOrderShipmentMap((prev) => ({ ...prev, [detailOrder.id]: "created" }));
        }

        setDetailOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
    setCreating(false);
  };

  // ── Bulk Submit ─────────────────────────────────────────

  const getEligibleOrders = useCallback(() => {
    return orders.filter((o) => {
      const carrier = getCarrierFromMeta(o.meta_data);
      const hasShipment = !!orderShipmentMap[o.id];
      const routeValid = !exitDataLoaded || isRouteValid(o, validDestinations);
      return carrier && !hasShipment && routeValid;
    });
  }, [orders, orderShipmentMap, exitDataLoaded, validDestinations]);

  const handleBulkSubmit = async () => {
    const eligible = getEligibleOrders();
    if (eligible.length === 0) {
      toast.error("No eligible orders to submit");
      return;
    }

    setBulkSubmitting(true);
    setBulkResults(null);
    setBulkDialogOpen(true);

    try {
      const res = await fetch("/api/shipments/bulk-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: eligible.map((o) => o.id) }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setBulkResults(json);
        // Update shipment map for successful results
        const newMap = { ...orderShipmentMap };
        for (const r of json.results) {
          if (r.status === "success" && r.shipmentId) {
            newMap[r.orderId] = "submitted";
          } else if (r.status === "skipped" && r.shipmentId) {
            newMap[r.orderId] = "exists";
          }
        }
        setOrderShipmentMap(newMap);
        toast.success(
          `Bulk submit: ${json.summary.success} success, ${json.summary.skipped} skipped, ${json.summary.errors} errors`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk submit failed");
    }
    setBulkSubmitting(false);
  };

  // ── UI Helpers ───────────────────────────────────────────

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const shippingName = (o: WooOrder) => {
    const s = o.shipping;
    const name = `${s.first_name} ${s.last_name}`.trim();
    return name || `${o.billing.first_name} ${o.billing.last_name}`.trim();
  };

  const shippingCountry = (o: WooOrder) => o.shipping.country || o.billing.country;
  const shippingCity = (o: WooOrder) => o.shipping.city || o.billing.city;

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            WooCommerce orders {total > 0 && `(${total} total)`}
            {lastSynced && (
              <span className="ml-2 text-xs">Last synced: {lastSynced}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <Button
              variant="default"
              onClick={handleBulkSubmit}
              disabled={bulkSubmitting || loading || getEligibleOrders().length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {bulkSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Rocket className="size-4" />
              )}
              {bulkSubmitting
                ? "Submitting..."
                : `Bulk Submit (${getEligibleOrders().length})`}
            </Button>
          )}
          <Button onClick={() => fetchOrders(page || 1, true)} disabled={loading}>
            <Download className="size-4" />
            {loading ? "Syncing..." : "Sync Orders"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {WC_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {exitDataLoaded && (
          <div className="flex items-center gap-1">
            <Button
              variant={routeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setRouteFilter("all")}
            >
              All Routes
            </Button>
            <Button
              variant={routeFilter === "invalid" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setRouteFilter("invalid")}
            >
              <AlertTriangle className="size-3.5 mr-1" />
              Route Issues
              {orders.filter((o) => !isRouteValid(o, validDestinations)).length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[10px] px-1">
                  {orders.filter((o) => !isRouteValid(o, validDestinations)).length}
                </Badge>
              )}
            </Button>
            <Button
              variant={routeFilter === "valid" ? "default" : "outline"}
              size="sm"
              onClick={() => setRouteFilter("valid")}
            >
              Valid Routes
            </Button>
          </div>
        )}
        <Badge variant="outline" className="text-xs">
          Page {page}/{totalPages}
        </Badge>
      </div>

      {/* Content */}
      {!lastSynced && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Download className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Click &quot;Sync Orders&quot; to load</p>
            <p className="text-muted-foreground text-sm mt-1">
              Orders are fetched on demand from WooCommerce
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin mx-auto mb-2" />
          Syncing orders from WooCommerce...
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No orders found</p>
            <p className="text-muted-foreground text-sm mt-1">
              No orders with status &quot;{statusFilter}&quot;
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">#</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(exitDataLoaded && routeFilter !== "all"
                  ? orders.filter((o) => {
                      const valid = isRouteValid(o, validDestinations);
                      return routeFilter === "valid" ? valid : !valid;
                    })
                  : orders
                ).map((order) => {
                  const shipmentStatus = orderShipmentMap[order.id];
                  const hasShipment = !!shipmentStatus;
                  const carrier = getCarrierFromMeta(order.meta_data);
                  const cityCode = getMetaValue(order.meta_data, "bzrc_city_code");
                  const isReady = !!carrier && !!cityCode;
                  const routeValid = !exitDataLoaded || isRouteValid(order, validDestinations);
                  return (
                  <TableRow
                    key={order.id}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      !routeValid ? "bg-red-50/50" :
                      hasShipment ? "bg-blue-50" :
                      isReady ? "bg-green-50/50" : ""
                    }`}
                    onClick={() => openDetail(order)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {order.number}
                        {!routeValid && exitDataLoaded && (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-medium">
                            <AlertTriangle className="size-2.5 mr-0.5" />
                            Invalid Route
                          </span>
                        )}
                        {hasShipment && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium">
                            <Check className="size-2.5 mr-0.5" />
                            {shipmentStatus}
                          </span>
                        )}
                        {!hasShipment && isReady && routeValid && (
                          <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px] font-medium">
                            {carrier}/{cityCode}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{shippingName(order)}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.shipping.phone || order.billing.phone || ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-sm">{shippingCountry(order)}</span>
                      {shippingCity(order) && (
                        <span className="text-xs text-muted-foreground">
                          {" "}/ {shippingCity(order)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {parseFloat(order.total).toFixed(2)} {order.currency}
                      {order.payment_method === "cod" && (
                        <div className="text-xs text-orange-600">COD</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {order.payment_method_title || order.payment_method}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {order.line_items.slice(0, 1).map((li) => (
                          <span key={li.id} className="truncate block max-w-[180px]">
                            {li.quantity}x {li.name}
                          </span>
                        ))}
                        {order.line_items.length > 1 && (
                          <span className="text-muted-foreground">
                            +{order.line_items.length - 1}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(order.date_created)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {page} / {totalPages} ({total} orders)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => fetchOrders(page - 1, true)}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => fetchOrders(page + 1, true)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Bulk Submit Results Dialog ────────────────────────── */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Submit Results</DialogTitle>
            <DialogDescription>
              {bulkSubmitting
                ? "Processing orders..."
                : bulkResults
                  ? `${bulkResults.summary.success} success, ${bulkResults.summary.skipped} skipped, ${bulkResults.summary.errors} errors`
                  : "Starting..."}
            </DialogDescription>
          </DialogHeader>

          {bulkSubmitting && !bulkResults && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Submitting orders to carrier...
              </p>
            </div>
          )}

          {bulkResults && (
            <div className="space-y-3">
              {/* Summary badges */}
              <div className="flex gap-2">
                <Badge className="bg-green-100 text-green-700">
                  {bulkResults.summary.success} Success
                </Badge>
                <Badge className="bg-yellow-100 text-yellow-700">
                  {bulkResults.summary.skipped} Skipped
                </Badge>
                <Badge className="bg-red-100 text-red-700">
                  {bulkResults.summary.errors} Errors
                </Badge>
              </div>

              {/* Results list */}
              <div className="space-y-1.5">
                {bulkResults.results.map((r) => (
                  <div
                    key={r.orderId}
                    className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${
                      r.status === "success"
                        ? "border-green-200 bg-green-50"
                        : r.status === "skipped"
                          ? "border-yellow-200 bg-yellow-50"
                          : "border-red-200 bg-red-50"
                    }`}
                  >
                    {r.status === "success" ? (
                      <CheckCircle2 className="size-4 text-green-600 mt-0.5 shrink-0" />
                    ) : r.status === "skipped" ? (
                      <SkipForward className="size-4 text-yellow-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="size-4 text-red-600 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        Order #{r.orderNumber || r.orderId}
                      </div>
                      {r.awb && (
                        <div className="text-xs text-green-700">
                          AWB: {r.awb}
                        </div>
                      )}
                      {r.error && (
                        <div className="text-xs text-muted-foreground truncate">
                          {r.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Order Detail Dialog ─────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order #{detailOrder?.number}</DialogTitle>
            <DialogDescription>
              WC ID: {detailOrder?.id} | <StatusBadge status={detailOrder?.status || ""} />
              {" | "}{detailOrder?.total} {detailOrder?.currency}
              {detailOrder?.payment_method === "cod" && " | COD"}
            </DialogDescription>
          </DialogHeader>

          {detailOrder && editedShipping && editedBilling && (
            <Tabs defaultValue="shipping" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="shipping">Shipping</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="shipment">Shipment</TabsTrigger>
              </TabsList>

              {/* ── Shipping Tab ───────────────────────────── */}
              <TabsContent value="shipping" className="space-y-4 mt-4">
                <AddressEditor
                  address={editedShipping}
                  onChange={(field, value) => {
                    setEditedShipping((prev) =>
                      prev ? { ...prev, [field]: value } : prev
                    );
                    // Invalidate city match when city or country changes
                    if (field === "city" || field === "country") {
                      setCityMatch(null);
                      setManualCityCode("");
                    }
                  }}
                  prefix="Shipping Address"
                  onTranslate={(fields) => handleTranslate(fields, "shipping")}
                  translating={translating}
                />

                {/* City Code Match Section */}
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Naqel City Code Match</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleMatchCity}
                      disabled={matchingCity || !editedShipping.city || !editedShipping.country}
                    >
                      <MapPin className="size-3.5" />
                      {matchingCity ? "Matching..." : "Match City"}
                    </Button>
                  </div>

                  {cityMatch && (
                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={CONFIDENCE_COLORS[cityMatch.confidence]}>
                          {cityMatch.confidence}
                          {cityMatch.confidence === "fuzzy" &&
                            ` (${Math.round(cityMatch.score * 100)}%)`}
                        </Badge>
                        {cityMatch.matchedCity ? (
                          <span className="text-sm font-medium">
                            {cityMatch.matchedCity.cityEN} → {cityMatch.matchedCity.cityCode}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">No match</span>
                        )}
                      </div>

                      {/* Alternatives dropdown */}
                      {cityMatch.alternatives.length > 0 && cityMatch.confidence !== "exact" && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Alternatives:</p>
                          <Select
                            value={manualCityCode || cityMatch.matchedCity?.cityCode || ""}
                            onValueChange={(val) => setManualCityCode(val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select alternative" />
                            </SelectTrigger>
                            <SelectContent>
                              {cityMatch.matchedCity && (
                                <SelectItem value={cityMatch.matchedCity.cityCode}>
                                  {cityMatch.matchedCity.cityEN} ({cityMatch.matchedCity.cityCode})
                                </SelectItem>
                              )}
                              {cityMatch.alternatives.map((alt) => (
                                <SelectItem key={alt.city.cityCode} value={alt.city.cityCode}>
                                  {alt.city.cityEN} ({alt.city.cityCode}) —{" "}
                                  {Math.round(alt.score * 100)}%
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Manual entry */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Manual code:</Label>
                        <Input
                          value={manualCityCode}
                          onChange={(e) => setManualCityCode(e.target.value)}
                          placeholder="Enter city code"
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Customer Note */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Customer Note</Label>
                  <Textarea
                    value={editedNote}
                    onChange={(e) => setEditedNote(e.target.value)}
                    className="text-sm"
                    rows={3}
                  />
                </div>

                {/* Save Button */}
                <Button className="w-full" variant="outline" onClick={handleSaveToWC} disabled={saving}>
                  <Save className="size-4" />
                  {saving ? "Saving..." : "Save Changes to WooCommerce"}
                </Button>
              </TabsContent>

              {/* ── Billing Tab ────────────────────────────── */}
              <TabsContent value="billing" className="space-y-4 mt-4">
                <AddressEditor
                  address={editedBilling}
                  onChange={(field, value) =>
                    setEditedBilling((prev) =>
                      prev ? { ...prev, [field]: value } : prev
                    )
                  }
                  prefix="Billing Address"
                  onTranslate={(fields) => handleTranslate(fields, "billing")}
                  translating={translating}
                />

                <Button className="w-full" variant="outline" onClick={handleSaveToWC} disabled={saving}>
                  <Save className="size-4" />
                  {saving ? "Saving..." : "Save Changes to WooCommerce"}
                </Button>
              </TabsContent>

              {/* ── Items Tab ──────────────────────────────── */}
              <TabsContent value="items" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Items ({detailOrder.line_items.length})
                  </p>
                  {detailOrder.line_items.map((li) => (
                    <div
                      key={li.id}
                      className="flex items-start justify-between rounded-md border p-3 text-sm"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{li.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {li.sku && `SKU: ${li.sku} | `}Qty: {li.quantity}
                        </div>
                      </div>
                      <div className="font-medium">
                        {parseFloat(li.total).toFixed(2)} {detailOrder.currency}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Shipping</div>
                  <div className="text-right">
                    {detailOrder.shipping_total} {detailOrder.currency}
                  </div>
                  <div className="text-muted-foreground">Discount</div>
                  <div className="text-right">
                    {detailOrder.discount_total} {detailOrder.currency}
                  </div>
                  <div className="font-semibold">Total</div>
                  <div className="text-right font-semibold">
                    {detailOrder.total} {detailOrder.currency}
                  </div>
                  {detailOrder.payment_method === "cod" && (
                    <>
                      <div className="text-muted-foreground">COD</div>
                      <div className="text-right font-medium text-orange-600">
                        {detailOrder.total} {detailOrder.currency}
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              {/* ── Shipment Tab ───────────────────────────── */}
              <TabsContent value="shipment" className="space-y-4 mt-4">
                {/* Carrier Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Carrier</Label>
                  <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIERS.map((c) => (
                        <SelectItem key={c.value} value={c.value} disabled={c.disabled}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    WC meta bzrc_carrier:{" "}
                    {getCarrierFromMeta(detailOrder.meta_data) || (
                      <span className="text-red-600 font-medium">not set</span>
                    )}
                  </p>
                  {!selectedCarrier && (
                    <p className="text-xs text-red-600 font-medium">
                      Carrier not selected — select a carrier to create shipment
                    </p>
                  )}
                </div>

                <Separator />

                {/* Summary */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Shipment Summary</p>
                  <div className="grid grid-cols-2 gap-2 text-sm rounded-md border p-3">
                    <div className="text-muted-foreground">Consignee</div>
                    <div>
                      {editedShipping?.first_name} {editedShipping?.last_name}
                    </div>
                    <div className="text-muted-foreground">Destination</div>
                    <div>
                      {editedShipping?.city}, {editedShipping?.country}
                    </div>
                    <div className="text-muted-foreground">City Code</div>
                    <div>
                      {manualCityCode
                        ? manualCityCode
                        : cityMatch?.matchedCity && cityMatch.confidence !== "none"
                          ? cityMatch.matchedCity.cityCode
                          : cityMatch?.confidence === "none"
                            ? <span className="text-red-600">Low confidence ({Math.round((cityMatch.score || 0) * 100)}%)</span>
                            : <span className="text-orange-600">Not matched yet</span>
                      }
                    </div>
                    <div className="text-muted-foreground">Carrier</div>
                    <div className="font-medium capitalize">
                      {selectedCarrier || <span className="text-red-600">Not selected</span>}
                    </div>
                    <div className="text-muted-foreground">Items</div>
                    <div>{detailOrder.line_items.length} items</div>
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-medium">
                      {detailOrder.total} {detailOrder.currency}
                    </div>
                    {(() => {
                      const destCC = (editedShipping?.country || detailOrder.shipping.country || detailOrder.billing.country || "").toUpperCase();
                      const destCur = countryCurrencyMap[destCC] || cityMatch?.matchedCity?.countryCurrency;
                      if (destCur && destCur !== detailOrder.currency) {
                        return (
                          <>
                            <div className="text-muted-foreground">Customs Currency</div>
                            <div className="font-medium text-blue-600">
                              {destCur} (will be converted from {detailOrder.currency})
                            </div>
                          </>
                        );
                      }
                      return null;
                    })()}
                    {detailOrder.payment_method === "cod" && (
                      <>
                        <div className="text-muted-foreground">COD</div>
                        <div className="font-medium text-orange-600">
                          {detailOrder.total} {detailOrder.currency}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Validation warnings */}
                {(() => {
                  const hasCityCode = !!manualCityCode || (cityMatch?.matchedCity && cityMatch.confidence !== "none");
                  const hasLowConfidence = cityMatch?.confidence === "none" && !manualCityCode;
                  const hasRouteIssue = exitDataLoaded && detailOrder && !isRouteValid(detailOrder, validDestinations);
                  const hasIssue = !selectedCarrier || !hasCityCode || hasRouteIssue;
                  if (!hasIssue) return null;
                  return (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
                      {hasRouteIssue && (
                        <div>
                          <AlertTriangle className="size-3.5 inline mr-1" />
                          Route TR &rarr; {(detailOrder!.shipping.country || detailOrder!.billing.country || "??").toUpperCase()} is not configured in exitLocation sheet
                        </div>
                      )}
                      {!selectedCarrier && (
                        <div>&#x2716; Carrier is not selected</div>
                      )}
                      {hasLowConfidence && cityMatch?.matchedCity && (
                        <div>
                          <AlertTriangle className="size-3.5 inline mr-1" />
                          City match confidence too low ({Math.round((cityMatch.score || 0) * 100)}%) — select from alternatives or enter city code manually
                        </div>
                      )}
                      {!cityMatch?.matchedCity && !manualCityCode && (
                        <div>&#x2716; City code is not matched — run city match or enter manually</div>
                      )}
                    </div>
                  );
                })()}

                {/* Existing shipment warning */}
                {detailOrder && orderShipmentMap[detailOrder.id] && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                    <Check className="size-3.5 inline mr-1" />
                    Shipment already exists for this order (status: <strong>{orderShipmentMap[detailOrder.id]}</strong>)
                  </div>
                )}

                {/* Save carrier + city code to WC */}
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleSaveToWC}
                  disabled={saving}
                >
                  <Save className="size-4" />
                  {saving ? "Saving..." : "Save Carrier & City Code to WC"}
                </Button>

                {/* Create Shipment Button */}
                <Button
                  className="w-full"
                  onClick={handleCreateShipment}
                  disabled={
                    creating ||
                    !selectedCarrier ||
                    (!manualCityCode && (!cityMatch?.matchedCity || cityMatch.confidence === "none")) ||
                    (exitDataLoaded && !!detailOrder && !isRouteValid(detailOrder, validDestinations))
                  }
                >
                  <Truck className="size-4" />
                  {creating ? "Submitting..." : "Create & Submit"}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
