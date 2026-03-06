"use client";

import { useEffect, useState, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  RefreshCw,
  Package,
  Send,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FileSpreadsheet,
  Radar,
  MapPin,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";

interface ShipmentData {
  id: number;
  woo_order_id: number | null;
  woo_order_number: string | null;
  customer_code: string;
  branch_code: string;
  product_type: string;
  description_of_goods: string;
  number_of_pieces: number;
  shipping_datetime: string;
  cod_amount: number | null;
  cod_currency: string | null;
  customs_declared_value: number | null;
  customs_value_currency: string | null;
  shipment_weight_value: number;
  status: string;
  status_message: string | null;
  airwaybill_number: string | null;
  tracking_number: string | null;
  last_tracked_at: string | null;
  created_at: string;
  updated_at: string;
  shipper_reference1: string | null;
  include_label: boolean;
  consignee: {
    person_name: string;
    company_name?: string | null;
    country_code: string;
    city: string;
    district?: string | null;
    line1: string;
    line2?: string | null;
    line3?: string | null;
    post_code?: string | null;
    phone1?: string | null;
    phone2?: string | null;
    cell_phone?: string | null;
    email?: string | null;
    type?: string | null;
    civil_id?: string | null;
    location_code1?: string | null;
    location_code2?: string | null;
    location_code3?: string | null;
    short_address?: string | null;
  };
  shipper: {
    person_name: string;
    company_name?: string | null;
    country_code: string;
    city: string;
    line1: string;
    line2?: string | null;
    post_code?: string | null;
    phone1?: string | null;
    email?: string | null;
  };
  items: {
    id: number;
    quantity: number;
    goods_description: string;
    customs_value: number;
    customs_currency: string;
    weight_value: number;
  }[];
}

interface TrackingEventData {
  id: number;
  shipment_id: number;
  airwaybill_number: string;
  event_code: string | null;
  event_description: string | null;
  event_date: string | null;
  event_location: string | null;
  event_detail: string | null;
  created_at: string;
}

interface TrackingData {
  shipment_id: number;
  airwaybill_number: string;
  current_status: string;
  events: TrackingEventData[];
  last_tracked_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-yellow-100 text-yellow-700",
  submitted: "bg-blue-100 text-blue-700",
  submit_failed: "bg-red-100 text-red-700",
  in_transit: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(0);

  // Selection for bulk submit
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Detail dialog
  const [detail, setDetail] = useState<ShipmentData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState<Set<number>>(new Set());

  // Tracking state
  const [tracking, setTracking] = useState<Set<number>>(new Set());
  const [trackingData, setTrackingData] = useState<Record<number, TrackingData>>({});
  const [trackingAll, setTrackingAll] = useState(false);

  // Invoice generation state
  const [generatingInvoice, setGeneratingInvoice] = useState<Set<number>>(new Set());

  // Cancel state
  const [cancelling, setCancelling] = useState<Set<number>>(new Set());

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "50",
        offset: String(page * 50),
      });
      if (filterStatus !== "all") params.set("status", filterStatus);

      const res = await fetch(`/api/shipments?${params}`);
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setShipments(json.shipments || []);
        setSelected(new Set());
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to fetch shipments"
      );
    }
    setLoading(false);
  }, [filterStatus, page]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const submittable = shipments.filter(
      (s) => s.status === "created" || s.status === "draft" || s.status === "pending"
    );
    if (selected.size === submittable.length && submittable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(submittable.map((s) => s.id)));
    }
  };

  const handleSubmitSingle = async (shipmentId: number) => {
    setSubmitting((prev) => new Set(prev).add(shipmentId));
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/submit`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`#${shipmentId}: ${json.error}`);
      } else {
        const s = json.shipment;
        if (s.status === "submit_failed") {
          toast.error(`#${s.id}: ${s.status_message || "Submit failed at carrier"}`);
        } else if (s.airwaybill_number) {
          toast.success(`#${s.id} submitted! AWB: ${s.airwaybill_number}`);
        } else {
          toast.success(`#${s.id} submitted (status: ${s.status})`);
        }
        fetchShipments();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    }
    setSubmitting((prev) => {
      const next = new Set(prev);
      next.delete(shipmentId);
      return next;
    });
  };

  const handleBulkSubmit = async () => {
    if (selected.size === 0) return;
    let success = 0;
    let failed = 0;

    for (const id of selected) {
      setSubmitting((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/shipments/${id}/submit`, {
          method: "POST",
        });
        const json = await res.json();
        if (json.error) {
          failed++;
        } else {
          success++;
        }
      } catch {
        failed++;
      }
      setSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }

    if (success > 0) toast.success(`${success} shipment(s) submitted`);
    if (failed > 0) toast.error(`${failed} failed`);
    setSelected(new Set());
    fetchShipments();
  };

  const handleDownloadLabel = async (shipment: ShipmentData) => {
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/label`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || `Failed to download label (HTTP ${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `label_${shipment.airwaybill_number || shipment.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Label downloaded");
    } catch {
      toast.error("Failed to download label");
    }
  };

  const handleTrackSingle = async (shipment: ShipmentData) => {
    setTracking((prev) => new Set(prev).add(shipment.id));
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/track`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`#${shipment.id}: ${json.error}`);
      } else {
        setTrackingData((prev) => ({ ...prev, [shipment.id]: json }));
        if (json.current_status && json.current_status !== shipment.status) {
          toast.success(
            `#${shipment.id} status: ${json.current_status} (${json.events?.length || 0} events)`
          );
          fetchShipments();
        } else {
          toast.success(
            `#${shipment.id}: ${json.events?.length || 0} events loaded`
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tracking failed");
    }
    setTracking((prev) => {
      const next = new Set(prev);
      next.delete(shipment.id);
      return next;
    });
  };

  const handleLoadCachedEvents = async (shipmentId: number) => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/tracking-events`);
      const json = await res.json();
      if (!json.error) {
        setTrackingData((prev) => ({ ...prev, [shipmentId]: json }));
      }
    } catch {
      // Silent fail for cached load
    }
  };

  const handleTrackAll = async () => {
    setTrackingAll(true);
    try {
      const res = await fetch("/api/shipments/tracking-poll", {
        method: "POST",
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success(
          `Tracked ${json.total_tracked} shipments: ${json.updated} updated, ${json.errors} failed`
        );
        fetchShipments();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk tracking failed");
    }
    setTrackingAll(false);
  };

  const handleGenerateInvoice = async (shipment: ShipmentData) => {
    if (!shipment.woo_order_id) {
      toast.error("No WooCommerce order linked to this shipment");
      return;
    }
    setGeneratingInvoice((prev) => new Set(prev).add(shipment.id));
    try {
      // 1. Fetch WC order for line items
      const orderRes = await fetch(`/api/woo/orders/${shipment.woo_order_id}`);
      const orderJson = await orderRes.json();
      if (orderJson.error) throw new Error(orderJson.error);
      const order = orderJson.order;

      // 2. Get product IDs from line items
      const productIds = (order.line_items || [])
        .map((li: { product_id: number }) => li.product_id)
        .filter((id: number) => id > 0);

      // 3. Fetch product list prices
      let prices: Record<string, { regular_price: string; price: string; sku: string }> = {};
      if (productIds.length > 0) {
        const priceRes = await fetch(`/api/woo/products/prices?ids=${productIds.join(",")}`);
        const priceJson = await priceRes.json();
        if (!priceJson.error) prices = priceJson.prices;
      }

      // 4. Build items with list prices for distribution
      const itemsWithPrices = (order.line_items || []).map(
        (li: { name: string; sku: string; quantity: number; product_id: number }) => {
          const product = prices[String(li.product_id)];
          const listPrice = product
            ? parseFloat(product.regular_price || product.price) || 0
            : 0;
          return {
            description: li.name,
            sku: li.sku || product?.sku || "",
            quantity: li.quantity,
            listPrice,
          };
        }
      );

      // 5. Distribute declared value and generate PDF
      const { distributeByListPrice, generateCommercialInvoice } = await import(
        "@/lib/invoice/commercial-invoice"
      );

      const declaredValue = shipment.customs_declared_value || 0;
      const invoiceItems = distributeByListPrice(itemsWithPrices, declaredValue);

      await generateCommercialInvoice({
        invoiceNumber: `INV-${shipment.woo_order_number || shipment.woo_order_id}`,
        invoiceDate: new Date().toLocaleDateString("en-GB"),
        awbNumber: shipment.airwaybill_number || "",
        consigneeName: shipment.consignee.person_name,
        consigneeCompany: shipment.consignee.company_name || undefined,
        consigneeAddress: [shipment.consignee.line1, shipment.consignee.line2]
          .filter(Boolean)
          .join(", "),
        consigneeCity: shipment.consignee.city,
        consigneeCountry: shipment.consignee.country_code,
        consigneePhone: shipment.consignee.phone1 || shipment.consignee.cell_phone || undefined,
        items: invoiceItems,
        totalValue: declaredValue,
        currency: shipment.customs_value_currency || "USD",
        numberOfPieces: shipment.number_of_pieces,
        totalWeight: shipment.shipment_weight_value,
      });

      toast.success("Invoice generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate invoice");
    }
    setGeneratingInvoice((prev) => {
      const next = new Set(prev);
      next.delete(shipment.id);
      return next;
    });
  };

  const isCancellable = (s: ShipmentData) =>
    s.status === "submit_failed" || s.status === "failed" || s.status === "created" || s.status === "draft";

  const handleCancelSingle = async (shipmentId: number) => {
    setCancelling((prev) => new Set(prev).add(shipmentId));
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.error) {
        toast.error(`#${shipmentId}: ${json.error}`);
      } else {
        toast.success(`#${shipmentId} cancelled`);
        fetchShipments();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
    setCancelling((prev) => {
      const next = new Set(prev);
      next.delete(shipmentId);
      return next;
    });
  };

  const isTrackable = (s: ShipmentData) =>
    !!s.airwaybill_number &&
    (s.status === "submitted" || s.status === "in_transit");

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const isSubmittable = (s: ShipmentData) =>
    s.status === "created" || s.status === "draft" || s.status === "pending" || s.status === "submit_failed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shipments</h1>
          <p className="text-muted-foreground">
            Naqel shipments via remote API
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button onClick={handleBulkSubmit} disabled={submitting.size > 0}>
              <Send className="size-4" />
              {submitting.size > 0
                ? "Submitting..."
                : `Submit to Naqel (${selected.size})`}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleTrackAll}
            disabled={trackingAll}
          >
            <Radar
              className={`size-4 ${trackingAll ? "animate-spin" : ""}`}
            />
            {trackingAll ? "Tracking..." : "Track All"}
          </Button>
          <Button
            variant="outline"
            onClick={fetchShipments}
            disabled={loading}
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="submit_failed">Submit Failed</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <Badge className="bg-primary text-primary-foreground">
            {selected.size} selected
          </Badge>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : shipments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No shipments found</p>
            <p className="text-muted-foreground text-sm mt-1">
              Create shipments from the Orders page
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-[40px]">
                    <Checkbox
                      checked={
                        selected.size > 0 &&
                        selected.size ===
                          shipments.filter(isSubmittable).length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium">ID</th>
                  <th className="p-3 text-left font-medium">Order #</th>
                  <th className="p-3 text-left font-medium">AWB</th>
                  <th className="p-3 text-left font-medium">Consignee</th>
                  <th className="p-3 text-left font-medium">Destination</th>
                  <th className="p-3 text-center font-medium">Status</th>
                  <th className="p-3 text-right font-medium">Weight</th>
                  <th className="p-3 text-right font-medium">Value</th>
                  <th className="p-3 text-left font-medium">Created</th>
                  <th className="p-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const statusCls =
                    STATUS_COLORS[s.status] || "bg-gray-100 text-gray-700";
                  const canSubmit = isSubmittable(s);
                  return (
                    <tr
                      key={s.id}
                      className={`border-b hover:bg-muted/30 cursor-pointer ${selected.has(s.id) ? "bg-muted/30" : ""}`}
                    >
                      <td
                        className="p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canSubmit && (
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggleSelect(s.id)}
                          />
                        )}
                      </td>
                      <td
                        className="p-3 font-mono text-xs"
                        onClick={() => {
                          setDetail(s);
                          setDetailOpen(true);
                        }}
                      >
                        {s.id}
                      </td>
                      <td
                        className="p-3 font-medium"
                        onClick={() => {
                          setDetail(s);
                          setDetailOpen(true);
                        }}
                      >
                        {s.woo_order_number || s.woo_order_id || "—"}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {s.airwaybill_number || "—"}
                      </td>
                      <td className="p-3 truncate max-w-[150px]">
                        {s.consignee.person_name}
                      </td>
                      <td className="p-3">
                        {s.consignee.country_code} / {s.consignee.city}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          className={`${statusCls} hover:${statusCls}`}
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {s.shipment_weight_value.toFixed(1)} kg
                      </td>
                      <td className="p-3 text-right">
                        {s.customs_declared_value != null
                          ? `${s.customs_declared_value.toFixed(2)} ${s.customs_value_currency || ""}`
                          : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {formatDate(s.created_at)}
                      </td>
                      <td
                        className="p-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {canSubmit && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSubmitSingle(s.id)}
                              disabled={submitting.has(s.id)}
                            >
                              <Send className="size-3.5" />
                              {submitting.has(s.id) ? "..." : "Submit"}
                            </Button>
                          )}
                          {isTrackable(s) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTrackSingle(s)}
                              disabled={tracking.has(s.id)}
                              title="Refresh Tracking"
                            >
                              <Radar
                                className={`size-3.5 ${tracking.has(s.id) ? "animate-spin" : ""}`}
                              />
                            </Button>
                          )}
                          {s.airwaybill_number && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadLabel(s)}
                                title="Download Label"
                              >
                                <Download className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleGenerateInvoice(s)}
                                disabled={generatingInvoice.has(s.id)}
                                title="Commercial Invoice"
                              >
                                {generatingInvoice.has(s.id) ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <FileSpreadsheet className="size-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                          {isCancellable(s) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleCancelSingle(s.id)}
                              disabled={cancelling.has(s.id)}
                              title="Cancel Shipment"
                            >
                              {cancelling.has(s.id) ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <XCircle className="size-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {shipments.length} shipments (offset {page * 50})
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={shipments.length < 50}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shipment #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail?.status} | AWB:{" "}
              {detail?.airwaybill_number || "pending"} | Order #
              {detail?.woo_order_number || detail?.woo_order_id}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="waybill">Waybill</TabsTrigger>
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger
                  value="tracking"
                  disabled={!detail.airwaybill_number}
                  onClick={() => {
                    if (detail.airwaybill_number && !trackingData[detail.id]) {
                      handleLoadCachedEvents(detail.id);
                    }
                  }}
                >
                  Tracking
                </TabsTrigger>
              </TabsList>

              {/* ── Summary Tab ─────────────────────────── */}
              <TabsContent value="summary" className="space-y-4 mt-4">
                {/* Consignee */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Consignee</p>
                  <div className="text-sm space-y-1">
                    <div className="font-medium">
                      {detail.consignee.person_name}
                    </div>
                    {detail.consignee.phone1 && (
                      <div>{detail.consignee.phone1}</div>
                    )}
                    {detail.consignee.email && (
                      <div className="text-muted-foreground">
                        {detail.consignee.email}
                      </div>
                    )}
                    <div>{detail.consignee.line1}</div>
                    <div>
                      {detail.consignee.city},{" "}
                      {detail.consignee.country_code}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Shipper */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Shipper</p>
                  <div className="text-sm">
                    {detail.shipper.person_name} — {detail.shipper.city},{" "}
                    {detail.shipper.country_code}
                  </div>
                </div>

                <Separator />

                {/* Summary Grid */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Product Type</div>
                  <div>{detail.product_type}</div>
                  <div className="text-muted-foreground">Weight</div>
                  <div>{detail.shipment_weight_value} kg</div>
                  <div className="text-muted-foreground">Pieces</div>
                  <div>{detail.number_of_pieces}</div>
                  {detail.cod_amount != null && detail.cod_amount > 0 && (
                    <>
                      <div className="text-muted-foreground">COD</div>
                      <div className="font-medium text-orange-600">
                        {detail.cod_amount} {detail.cod_currency}
                      </div>
                    </>
                  )}
                  {detail.customs_declared_value != null && (
                    <>
                      <div className="text-muted-foreground">Customs Value</div>
                      <div>
                        {detail.customs_declared_value}{" "}
                        {detail.customs_value_currency}
                      </div>
                    </>
                  )}
                  <div className="text-muted-foreground">Credential</div>
                  <div>
                    {detail.customer_code} / {detail.branch_code}
                  </div>
                </div>

                {/* AWB + Label section */}
                {detail.airwaybill_number && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">
                        Airwaybill & Label
                      </p>
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <div className="font-mono font-medium">
                            {detail.airwaybill_number}
                          </div>
                          {detail.tracking_number && (
                            <div className="text-xs text-muted-foreground">
                              Tracking: {detail.tracking_number}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadLabel(detail)}
                          >
                            <FileText className="size-4" />
                            Label
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateInvoice(detail)}
                            disabled={generatingInvoice.has(detail.id)}
                          >
                            {generatingInvoice.has(detail.id) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="size-4" />
                            )}
                            Invoice
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Submit button */}
                {isSubmittable(detail) && (
                  <>
                    <Separator />
                    <Button
                      className="w-full"
                      onClick={() => {
                        handleSubmitSingle(detail.id);
                        setDetailOpen(false);
                      }}
                      disabled={submitting.has(detail.id)}
                    >
                      <Send className="size-4" />
                      {submitting.has(detail.id)
                        ? "Submitting..."
                        : "Submit to Naqel"}
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* ── Waybill Tab (carrier-bound values) ──── */}
              <TabsContent value="waybill" className="space-y-4 mt-4">
                <p className="text-xs text-muted-foreground">
                  All field values that will be / were sent to the carrier API
                </p>

                {/* Shipment Header */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Shipment</p>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="grid grid-cols-[160px_1fr] gap-y-1.5 text-xs font-mono">
                      <span className="text-muted-foreground">customer_code</span>
                      <span>{detail.customer_code}</span>
                      <span className="text-muted-foreground">branch_code</span>
                      <span>{detail.branch_code}</span>
                      <span className="text-muted-foreground">product_type</span>
                      <span>{detail.product_type}</span>
                      <span className="text-muted-foreground">description_of_goods</span>
                      <span className="break-all">{detail.description_of_goods}</span>
                      <span className="text-muted-foreground">number_of_pieces</span>
                      <span>{detail.number_of_pieces}</span>
                      <span className="text-muted-foreground">shipping_datetime</span>
                      <span>{detail.shipping_datetime}</span>
                      <span className="text-muted-foreground">shipment_weight_value</span>
                      <span>{detail.shipment_weight_value}</span>
                      <span className="text-muted-foreground">shipment_weight_unit</span>
                      <span>1 (KG)</span>
                      <span className="text-muted-foreground">shipper_reference1</span>
                      <span>{detail.shipper_reference1 || "—"}</span>
                      <span className="text-muted-foreground">include_label</span>
                      <span>{detail.include_label ? "true" : "false"}</span>
                      {detail.cod_amount != null && detail.cod_amount > 0 && (
                        <>
                          <span className="text-muted-foreground">cod_amount</span>
                          <span className="text-orange-600 font-medium">{detail.cod_amount}</span>
                          <span className="text-muted-foreground">cod_currency</span>
                          <span className="text-orange-600">{detail.cod_currency}</span>
                        </>
                      )}
                      {detail.customs_declared_value != null && (
                        <>
                          <span className="text-muted-foreground">customs_declared_value</span>
                          <span>{detail.customs_declared_value}</span>
                          <span className="text-muted-foreground">customs_value_currency</span>
                          <span>{detail.customs_value_currency}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Consignee Detail */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Consignee</p>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="grid grid-cols-[160px_1fr] gap-y-1.5 text-xs font-mono">
                      <span className="text-muted-foreground">person_name</span>
                      <span>{detail.consignee.person_name}</span>
                      {detail.consignee.company_name && (
                        <>
                          <span className="text-muted-foreground">company_name</span>
                          <span>{detail.consignee.company_name}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">country_code</span>
                      <span>{detail.consignee.country_code}</span>
                      <span className="text-muted-foreground">city</span>
                      <span>{detail.consignee.city}</span>
                      <span className="text-muted-foreground">line1</span>
                      <span className="break-all">{detail.consignee.line1}</span>
                      {detail.consignee.line2 && (
                        <>
                          <span className="text-muted-foreground">line2</span>
                          <span className="break-all">{detail.consignee.line2}</span>
                        </>
                      )}
                      {detail.consignee.post_code && (
                        <>
                          <span className="text-muted-foreground">post_code</span>
                          <span>{detail.consignee.post_code}</span>
                        </>
                      )}
                      {detail.consignee.district && (
                        <>
                          <span className="text-muted-foreground">district</span>
                          <span>{detail.consignee.district}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">phone1</span>
                      <span>{detail.consignee.phone1 || "—"}</span>
                      {detail.consignee.cell_phone && (
                        <>
                          <span className="text-muted-foreground">cell_phone</span>
                          <span>{detail.consignee.cell_phone}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">email</span>
                      <span>{detail.consignee.email || "—"}</span>
                      {detail.consignee.location_code1 && (
                        <>
                          <span className="text-muted-foreground">location_code1</span>
                          <span>{detail.consignee.location_code1}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Shipper Detail */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Shipper</p>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="grid grid-cols-[160px_1fr] gap-y-1.5 text-xs font-mono">
                      <span className="text-muted-foreground">person_name</span>
                      <span>{detail.shipper.person_name}</span>
                      {detail.shipper.company_name && (
                        <>
                          <span className="text-muted-foreground">company_name</span>
                          <span>{detail.shipper.company_name}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">country_code</span>
                      <span>{detail.shipper.country_code}</span>
                      <span className="text-muted-foreground">city</span>
                      <span>{detail.shipper.city}</span>
                      <span className="text-muted-foreground">line1</span>
                      <span className="break-all">{detail.shipper.line1}</span>
                      {detail.shipper.line2 && (
                        <>
                          <span className="text-muted-foreground">line2</span>
                          <span>{detail.shipper.line2}</span>
                        </>
                      )}
                      {detail.shipper.post_code && (
                        <>
                          <span className="text-muted-foreground">post_code</span>
                          <span>{detail.shipper.post_code}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">phone1</span>
                      <span>{detail.shipper.phone1 || "—"}</span>
                      <span className="text-muted-foreground">email</span>
                      <span>{detail.shipper.email || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Items Detail */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Items ({detail.items.length})</p>
                  {detail.items.map((item, idx) => (
                    <div key={item.id} className="rounded-md border bg-muted/30 p-3">
                      <p className="text-xs font-semibold mb-2">Item {idx + 1}</p>
                      <div className="grid grid-cols-[160px_1fr] gap-y-1.5 text-xs font-mono">
                        <span className="text-muted-foreground">goods_description</span>
                        <span className="break-all">{item.goods_description}</span>
                        <span className="text-muted-foreground">quantity</span>
                        <span>{item.quantity}</span>
                        <span className="text-muted-foreground">weight_value</span>
                        <span>{item.weight_value}</span>
                        <span className="text-muted-foreground">customs_value</span>
                        <span>{item.customs_value}</span>
                        <span className="text-muted-foreground">customs_currency</span>
                        <span>{item.customs_currency}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AWB result */}
                {detail.airwaybill_number && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Carrier Response</p>
                    <div className="rounded-md border bg-green-50 p-3">
                      <div className="grid grid-cols-[160px_1fr] gap-y-1.5 text-xs font-mono">
                        <span className="text-muted-foreground">status</span>
                        <span className="font-medium text-green-700">{detail.status}</span>
                        <span className="text-muted-foreground">airwaybill_number</span>
                        <span className="font-medium">{detail.airwaybill_number}</span>
                        {detail.tracking_number && (
                          <>
                            <span className="text-muted-foreground">tracking_number</span>
                            <span>{detail.tracking_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detail.status === "submit_failed" && detail.status_message && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-mono text-red-700 break-all">
                    <p className="font-semibold mb-1">Error:</p>
                    {detail.status_message}
                  </div>
                )}
              </TabsContent>

              {/* ── Items Tab ──────────────────────────── */}
              <TabsContent value="items" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Items ({detail.items.length})
                  </p>
                  {detail.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-md border p-3 text-sm"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {item.goods_description}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Qty: {item.quantity} | {item.weight_value} kg
                        </div>
                      </div>
                      <div className="font-medium">
                        {item.customs_value.toFixed(2)} {item.customs_currency}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Total Weight</div>
                  <div>{detail.shipment_weight_value} kg</div>
                  <div className="text-muted-foreground">Total Pieces</div>
                  <div>{detail.number_of_pieces}</div>
                  {detail.customs_declared_value != null && (
                    <>
                      <div className="text-muted-foreground">Total Customs Value</div>
                      <div>
                        {detail.customs_declared_value}{" "}
                        {detail.customs_value_currency}
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              {/* ── Tracking Tab ─────────────────────────── */}
              <TabsContent value="tracking" className="space-y-4 mt-4">
                {detail.airwaybill_number ? (
                  <>
                    {/* AWB + Refresh */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono font-medium text-sm">
                          AWB: {detail.airwaybill_number}
                        </div>
                        {trackingData[detail.id]?.last_tracked_at && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <Clock className="inline size-3 mr-1" />
                            Last checked:{" "}
                            {formatDate(trackingData[detail.id].last_tracked_at!)}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTrackSingle(detail)}
                        disabled={tracking.has(detail.id)}
                      >
                        <Radar
                          className={`size-4 ${tracking.has(detail.id) ? "animate-spin" : ""}`}
                        />
                        {tracking.has(detail.id) ? "Tracking..." : "Refresh Status"}
                      </Button>
                    </div>

                    {/* Current Status Badge */}
                    {trackingData[detail.id] && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Current Status:</span>
                        <Badge
                          className={
                            STATUS_COLORS[trackingData[detail.id].current_status] ||
                            "bg-gray-100 text-gray-700"
                          }
                        >
                          {trackingData[detail.id].current_status}
                        </Badge>
                      </div>
                    )}

                    <Separator />

                    {/* Timeline */}
                    {trackingData[detail.id]?.events?.length > 0 ? (
                      <div className="space-y-0">
                        <p className="text-sm font-semibold mb-3">
                          Tracking Events ({trackingData[detail.id].events.length})
                        </p>
                        <div className="relative pl-6">
                          {/* Vertical line */}
                          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                          {trackingData[detail.id].events.map((event, idx) => (
                            <div key={event.id} className="relative pb-4 last:pb-0">
                              {/* Dot */}
                              <div
                                className={`absolute -left-6 top-1.5 size-[10px] rounded-full border-2 ${
                                  idx === 0
                                    ? "bg-primary border-primary"
                                    : "bg-background border-muted-foreground/40"
                                }`}
                              />
                              <div className="text-sm">
                                <div className="font-medium">
                                  {event.event_description || event.event_code || "Status Update"}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  {event.event_date && (
                                    <span>
                                      <Clock className="inline size-3 mr-0.5" />
                                      {formatDate(event.event_date)}
                                    </span>
                                  )}
                                  {event.event_location && (
                                    <span>
                                      <MapPin className="inline size-3 mr-0.5" />
                                      {event.event_location}
                                    </span>
                                  )}
                                  {event.event_code && (
                                    <span className="font-mono">
                                      [{event.event_code}]
                                    </span>
                                  )}
                                </div>
                                {event.event_detail && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {event.event_detail}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : trackingData[detail.id] ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        No tracking events yet. Click &quot;Refresh Status&quot; to fetch from carrier.
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        Click &quot;Refresh Status&quot; to fetch tracking information from the carrier.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No airwaybill number — submit shipment first
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
