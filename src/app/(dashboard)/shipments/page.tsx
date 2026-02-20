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
  airwaybill_number: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  shipper_reference1: string | null;
  include_label: boolean;
  consignee: {
    person_name: string;
    country_code: string;
    city: string;
    line1: string;
    phone1?: string | null;
    email?: string | null;
  };
  shipper: {
    person_name: string;
    country_code: string;
    city: string;
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

const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-yellow-100 text-yellow-700",
  submitted: "bg-blue-100 text-blue-700",
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
        if (s.airwaybill_number) {
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
    // Labels come from the carrier_response_payload after submission
    // For now, fetch the shipment detail and check for label data
    try {
      const res = await fetch(`/api/shipments/${shipment.id}`);
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      // The remote API may include label data in the response or carrier_response_payload
      // For now, open the shipment detail
      toast.info(
        shipment.airwaybill_number
          ? `AWB: ${shipment.airwaybill_number} — Label download available after carrier integration`
          : "No AWB yet — submit the shipment first"
      );
    } catch {
      toast.error("Failed to fetch label");
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const isSubmittable = (s: ShipmentData) =>
    s.status === "created" || s.status === "draft" || s.status === "pending";

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
                          {s.airwaybill_number && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadLabel(s)}
                              title="Download Label"
                            >
                              <Download className="size-3.5" />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Shipment #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail?.status} | AWB:{" "}
              {detail?.airwaybill_number || "pending"} | Order #
              {detail?.woo_order_number || detail?.woo_order_id}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4 py-4">
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

              {/* Items */}
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

              {/* Summary */}
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
                    <div className="text-muted-foreground">
                      Customs Value
                    </div>
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadLabel(detail)}
                      >
                        <FileText className="size-4" />
                        Label
                      </Button>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
