"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  Download,
  Check,
  AlertTriangle,
  Rocket,
  Loader2,
} from "lucide-react";
import {
  StatusBadge,
  getCarrierFromMeta,
  getMetaValue,
  isRouteValid,
  WC_STATUSES,
} from "@/components/orders/order-types";
import type {
  WooAddress,
  WooOrder,
  CityMatchResult,
  BulkResults,
} from "@/components/orders/order-types";
import { BulkSubmitDialog } from "@/components/orders/bulk-submit-dialog";
import { OrderDetailDialog } from "@/components/orders/order-detail-dialog";

// ── Main Page ──────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("nqlrdysbmt");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("bzrc_selected_store") || "bazaarica";
    }
    return "bazaarica";
  });
  const [availableStores, setAvailableStores] = useState<{ id: string; name: string; active: boolean }[]>([]);

  const [creating, setCreating] = useState(false);

  // Bulk submit state
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResults | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Shipment existence tracking
  const [orderShipmentMap, setOrderShipmentMap] = useState<Record<number, string>>({});

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
      const res = await fetch("/api/shipments?limit=200");
      const json = await res.json();
      if (json.shipments) {
        const map: Record<number, string> = {};
        for (const s of json.shipments) {
          if (s.woo_order_id) {
            if (!map[s.woo_order_id] || s.status === "submitted" || s.status === "in_transit" || s.status === "delivered") {
              map[s.woo_order_id] = s.status;
            }
          }
        }
        setOrderShipmentMap(map);
      }
    } catch {
      // Silent fail
    }
  };

  // ── Orders cache (sessionStorage) ───────────────────────
  const cacheKey = (filter: string, p: number) => `bzrc_orders_${selectedStore}_${filter}_p${p}`;

  const saveToCache = (filter: string, p: number, data: { orders: WooOrder[]; totalPages: number; total: number }) => {
    try {
      sessionStorage.setItem(cacheKey(filter, p), JSON.stringify({ ...data, ts: Date.now() }));
    } catch { /* storage full */ }
  };

  const loadFromCache = (filter: string, p: number): { orders: WooOrder[]; totalPages: number; total: number } | null => {
    try {
      const raw = sessionStorage.getItem(cacheKey(filter, p));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > 60 * 60 * 1000) return null; // 1 hour TTL
      return cached;
    } catch { return null; }
  };

  // ── Fetch Orders ────────────────────────────────────────

  const fetchOrders = useCallback(
    async (p: number, forceRefresh = false) => {
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
        const params = new URLSearchParams({ page: String(p), per_page: "50" });
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (selectedStore) params.set("store", selectedStore);

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
          saveToCache(statusFilter, p, {
            orders: fetchedOrders,
            totalPages: json.totalPages || 1,
            total: json.total || 0,
          });
          checkShipmentsForOrders();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch orders");
      }
      setLoading(false);
    },
    [statusFilter, selectedStore]
  );

  // On mount, filter, or store change: only load from cache (no auto-fetch from WC)
  useEffect(() => {
    const cached = loadFromCache(statusFilter, 1);
    if (cached) {
      setOrders(cached.orders);
      setTotalPages(cached.totalPages);
      setTotal(cached.total);
      setPage(1);
      setLastSynced("cached");
      checkShipmentsForOrders();
    } else {
      // No cache — show empty state prompting manual sync
      setOrders([]);
      setTotalPages(1);
      setTotal(0);
      setPage(1);
      setLastSynced(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Fetch reference data + stores
  useEffect(() => {
    // Load available stores
    fetch("/api/settings/stores")
      .then((r) => r.json())
      .then((j) => { if (j.stores) setAvailableStores(j.stores); })
      .catch(() => {});

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
        if (json.naqelCityCodes) {
          const ccMap: Record<string, string> = {};
          for (const row of json.naqelCityCodes) {
            const cc = (row.countryCode || "").toUpperCase();
            const cur = (row.countryCurrency || "").toUpperCase();
            if (cc && cur && !ccMap[cc]) ccMap[cc] = cur;
          }
          setCountryCurrencyMap(ccMap);
        }
      } catch {
        // Silent fail
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
    const savedCityCode = getMetaValue(order.meta_data, "bzrc_city_code");
    setManualCityCode(savedCityCode);
    originalOrderRef.current = order;
    setDetailOpen(true);

    const city = order.shipping.city || order.billing.city;
    const country = order.shipping.country || order.billing.country;
    const orderCarrier = getCarrierFromMeta(order.meta_data);
    if (!savedCityCode && city && country) {
      autoMatchCity(country, city, orderCarrier || undefined);
    }
  };

  // ── Auto city match ────────────────────────────────────
  const autoMatchCity = async (countryCode: string, cityName: string, carrier?: string) => {
    setMatchingCity(true);
    try {
      const res = await fetch("/api/city-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, cityName, carrier }),
      });
      const json = await res.json();
      if (!json.error) {
        setCityMatch(json as CityMatchResult);
        if (json.carrier === "smsa") {
          if (json.confidence === "exact") toast.success(`SMSA city matched: ${json.smsaCity}`);
          else if (json.confidence !== "none" && json.smsaCity) toast.info(`SMSA city ${json.confidence} match: ${json.smsaCity} (${Math.round(json.score * 100)}%)`);
          else {
            // SMSA accepts free-text cities — auto-fill original name
            setManualCityCode(cityName);
            toast.info(`SMSA: using "${cityName}" as city (not in offices list)`);
          }
        } else {
          if (json.confidence === "exact") toast.success(`City matched: ${json.matchedCity?.cityEN} → ${json.matchedCity?.cityCode}`);
          else if (json.confidence !== "none") toast.info(`City ${json.confidence} match: ${json.matchedCity?.cityEN} (${Math.round(json.score * 100)}%)`);
        }
      }
    } catch {
      // Silent fail
    }
    setMatchingCity(false);
  };

  // ── Translation ──────────────────────────────────────────
  const handleTranslate = async (fields: Record<string, string>, target: "shipping" | "billing") => {
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
          carrier: selectedCarrier || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`City match failed: ${json.error}`);
      } else {
        setCityMatch(json as CityMatchResult);
        if (json.carrier === "smsa") {
          if (json.confidence === "exact") toast.success(`SMSA city matched: ${json.smsaCity}`);
          else if (json.confidence === "none") {
            // SMSA accepts free-text cities — auto-fill original name
            const fallback = editedShipping?.city || "";
            if (fallback) setManualCityCode(fallback);
            toast.info(`SMSA: using "${fallback}" as city (not in offices list)`);
          }
          else toast.info(`SMSA ${json.confidence} match: ${json.smsaCity} (${Math.round(json.score * 100)}%) — please confirm`);
        } else {
          if (json.confidence === "exact") toast.success(`Exact match: ${json.matchedCity?.cityEN} (${json.matchedCity?.cityCode})`);
          else if (json.confidence === "none") toast.error("No city match found — please enter manually");
          else toast.info(`${json.confidence} match: ${json.matchedCity?.cityEN} (${Math.round(json.score * 100)}%) — please confirm`);
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

      const currentCarrier = getCarrierFromMeta(detailOrder.meta_data);
      const currentCityCode = getMetaValue(detailOrder.meta_data, "bzrc_city_code");
      const currentCurrency = getMetaValue(detailOrder.meta_data, "bzrc_country_currency");
      const cityCode = manualCityCode
        || (cityMatch?.carrier === "smsa" ? cityMatch?.smsaCity : cityMatch?.matchedCity?.cityCode)
        || "";
      const countryCurrency = cityMatch?.matchedCity?.countryCurrency || "";

      const metaUpdates: { key: string; value: string }[] = [];
      if (selectedCarrier !== currentCarrier) metaUpdates.push({ key: "bzrc_carrier", value: selectedCarrier });
      if (cityCode && cityCode !== currentCityCode) metaUpdates.push({ key: "bzrc_city_code", value: cityCode });
      if (countryCurrency && countryCurrency !== currentCurrency) metaUpdates.push({ key: "bzrc_country_currency", value: countryCurrency });
      if (metaUpdates.length > 0) updateData.meta_data = metaUpdates;

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
          setSelectedCarrier(getCarrierFromMeta(json.order.meta_data));
          setOrders((prev) => prev.map((o) => (o.id === json.order.id ? json.order : o)));
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
    if (!selectedCarrier) { toast.error("Select a carrier first"); return; }

    const resolvedCityCode = manualCityCode
      || (cityMatch?.carrier === "smsa" ? cityMatch?.smsaCity : cityMatch?.matchedCity?.cityCode)
      || "";
    if (!resolvedCityCode) { toast.error("Run city match or enter city code manually"); return; }

    // SMSA country restriction check
    const destCountry = (editedShipping?.country || detailOrder.shipping.country || detailOrder.billing.country || "").toUpperCase();
    if (selectedCarrier === "smsa") {
      const SMSA_COUNTRIES = new Set(["SA","BH","EG","KW","AE","JO","OM","QA","ZA","US"]);
      if (!SMSA_COUNTRIES.has(destCountry)) {
        toast.error(`SMSA does not support destination ${destCountry}. Supported: SA, BH, EG, KW, AE, JO, OM, QA, ZA, US`);
        return;
      }
    }

    setCreating(true);
    try {
      const targetCurrency = countryCurrencyMap[destCountry] || cityMatch?.matchedCity?.countryCurrency;
      let convertedTotal: number | undefined;
      let convertedCurrency: string | undefined;

      if (targetCurrency && detailOrder.currency !== targetCurrency) {
        try {
          const rateRes = await fetch(`/api/exchange-rates?from=${detailOrder.currency}&to=${targetCurrency}&amount=${detailOrder.total}`);
          const rateJson = await rateRes.json();
          if (rateJson.converted_amount) {
            convertedTotal = rateJson.converted_amount;
            convertedCurrency = targetCurrency;
            toast.info(`Currency converted: ${detailOrder.total} ${detailOrder.currency} → ${convertedTotal!.toFixed(2)} ${targetCurrency}`);
          }
        } catch {
          toast.warning("Currency conversion failed — using original currency");
        }
      }

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooOrderId: detailOrder.id,
          carrier: selectedCarrier,
          cityCode: resolvedCityCode,
          countryCurrency: convertedCurrency || (convertedTotal != null ? targetCurrency : undefined),
          convertedTotal,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        const shipmentId = json.shipment.id;
        toast.success(`Shipment #${shipmentId} created — submitting to carrier...`);

        try {
          const submitRes = await fetch(`/api/shipments/${shipmentId}/submit`, { method: "POST" });
          const submitJson = await submitRes.json();
          if (submitJson.error) {
            toast.error(`Submit failed: ${submitJson.error}`);
            setOrderShipmentMap((prev) => ({ ...prev, [detailOrder.id]: "submit_failed" }));
          } else {
            const awb = submitJson.shipment?.airwaybill_number || "";
            toast.success(awb ? `Submitted! AWB: ${awb}` : "Submitted to carrier!");
            setOrderShipmentMap((prev) => ({ ...prev, [detailOrder.id]: submitJson.shipment?.status || "submitted" }));
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
    if (eligible.length === 0) { toast.error("No eligible orders to submit"); return; }

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
        const newMap = { ...orderShipmentMap };
        for (const r of json.results) {
          if (r.status === "success" && r.shipmentId) newMap[r.orderId] = "submitted";
          else if (r.status === "skipped" && r.shipmentId) newMap[r.orderId] = "exists";
        }
        setOrderShipmentMap(newMap);
        toast.success(`Bulk submit: ${json.summary.success} success, ${json.summary.skipped} skipped, ${json.summary.errors} errors`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk submit failed");
    }
    setBulkSubmitting(false);
  };

  // ── UI Helpers ───────────────────────────────────────────
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

  const shippingName = (o: WooOrder) => {
    const name = `${o.shipping.first_name} ${o.shipping.last_name}`.trim();
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
            {availableStores.find((s) => s.id === selectedStore)?.name || "WooCommerce"} orders {total > 0 && `(${total} total)`}
            {lastSynced && <span className="ml-2 text-xs">Last synced: {lastSynced}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {availableStores.length > 1 && (
            <Select
              value={selectedStore}
              onValueChange={(v) => {
                setSelectedStore(v);
                sessionStorage.setItem("bzrc_selected_store", v);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Store" />
              </SelectTrigger>
              <SelectContent>
                {availableStores.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={!s.active}>
                    {s.name}{!s.active ? " (soon)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {orders.length > 0 && (
            <Button
              variant="default"
              onClick={handleBulkSubmit}
              disabled={bulkSubmitting || loading || getEligibleOrders().length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {bulkSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {bulkSubmitting ? "Submitting..." : `Bulk Submit (${getEligibleOrders().length})`}
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
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {exitDataLoaded && (
          <div className="flex items-center gap-1">
            <Button variant={routeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setRouteFilter("all")}>
              All Routes
            </Button>
            <Button variant={routeFilter === "invalid" ? "destructive" : "outline"} size="sm" onClick={() => setRouteFilter("invalid")}>
              <AlertTriangle className="size-3.5 mr-1" />
              Route Issues
              {orders.filter((o) => !isRouteValid(o, validDestinations)).length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[10px] px-1">
                  {orders.filter((o) => !isRouteValid(o, validDestinations)).length}
                </Badge>
              )}
            </Button>
            <Button variant={routeFilter === "valid" ? "default" : "outline"} size="sm" onClick={() => setRouteFilter("valid")}>
              Valid Routes
            </Button>
          </div>
        )}
        <Badge variant="outline" className="text-xs">Page {page}/{totalPages}</Badge>
      </div>

      {/* Content */}
      {!lastSynced && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Download className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Click &quot;Sync Orders&quot; to load</p>
            <p className="text-muted-foreground text-sm mt-1">Orders are fetched on demand from WooCommerce</p>
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
            <p className="text-muted-foreground text-sm mt-1">No orders with status &quot;{statusFilter}&quot;</p>
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
                        <div className="text-xs text-muted-foreground">{order.shipping.phone || order.billing.phone || ""}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">{shippingCountry(order)}</span>
                        {shippingCity(order) && <span className="text-xs text-muted-foreground"> / {shippingCity(order)}</span>}
                      </TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {parseFloat(order.total).toFixed(2)} {order.currency}
                        {order.payment_method === "cod" && <div className="text-xs text-orange-600">COD</div>}
                      </TableCell>
                      <TableCell className="text-xs">{order.payment_method_title || order.payment_method}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {order.line_items.slice(0, 1).map((li) => (
                            <span key={li.id} className="truncate block max-w-[180px]">{li.quantity}x {li.name}</span>
                          ))}
                          {order.line_items.length > 1 && <span className="text-muted-foreground">+{order.line_items.length - 1}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(order.date_created)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Page {page} / {totalPages} ({total} orders)</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchOrders(page - 1, true)}>
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchOrders(page + 1, true)}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <BulkSubmitDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        submitting={bulkSubmitting}
        results={bulkResults}
      />

      <OrderDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detailOrder={detailOrder}
        editedShipping={editedShipping}
        setEditedShipping={setEditedShipping}
        editedBilling={editedBilling}
        setEditedBilling={setEditedBilling}
        editedNote={editedNote}
        setEditedNote={setEditedNote}
        selectedCarrier={selectedCarrier}
        setSelectedCarrier={setSelectedCarrier}
        cityMatch={cityMatch}
        setCityMatch={setCityMatch}
        matchingCity={matchingCity}
        manualCityCode={manualCityCode}
        setManualCityCode={setManualCityCode}
        orderShipmentMap={orderShipmentMap}
        countryCurrencyMap={countryCurrencyMap}
        exitDataLoaded={exitDataLoaded}
        validDestinations={validDestinations}
        saving={saving}
        creating={creating}
        translating={translating}
        onMatchCity={handleMatchCity}
        onAutoMatchCity={autoMatchCity}
        onTranslate={handleTranslate}
        onSaveToWC={handleSaveToWC}
        onCreateShipment={handleCreateShipment}
      />
    </div>
  );
}
