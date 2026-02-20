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
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  Truck,
} from "lucide-react";

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
}

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

function StatusBadge({ status }: { status: string }) {
  const cls = WC_STATUS_COLORS[status] || "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("nqlrdysbmt");

  // Selection for bulk shipment creation
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  // Detail dialog
  const [detailOrder, setDetailOrder] = useState<WooOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchOrders = useCallback(
    async (p: number) => {
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
          setOrders(json.orders || []);
          setTotalPages(json.totalPages || 1);
          setTotal(json.total || 0);
          setPage(p);
          setSelected(new Set());
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to fetch orders"
        );
      }
      setLoading(false);
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  const toggleSelect = (orderId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  };

  const handleCreateShipments = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one order");
      return;
    }
    setCreating(true);
    let success = 0;
    let failed = 0;

    for (const orderId of selected) {
      try {
        const res = await fetch("/api/shipments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wooOrderId: orderId }),
        });
        const json = await res.json();
        if (json.error) {
          toast.error(`Order ${orderId}: ${json.error}`);
          failed++;
        } else {
          success++;
        }
      } catch {
        failed++;
      }
    }

    if (success > 0)
      toast.success(`${success} shipment(s) created`);
    if (failed > 0) toast.error(`${failed} failed`);
    setSelected(new Set());
    setCreating(false);
  };

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

  const shippingCountry = (o: WooOrder) =>
    o.shipping.country || o.billing.country;

  const shippingCity = (o: WooOrder) => o.shipping.city || o.billing.city;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            WooCommerce orders {total > 0 && `(${total} total)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button onClick={handleCreateShipments} disabled={creating}>
              <Truck className="size-4" />
              {creating
                ? "Creating..."
                : `Create Shipments (${selected.size})`}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => fetchOrders(page)}
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
        <Badge variant="outline" className="text-xs">
          Page {page}/{totalPages}
        </Badge>
        {selected.size > 0 && (
          <Badge className="bg-primary text-primary-foreground">
            {selected.size} selected
          </Badge>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
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
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        selected.size === orders.length && orders.length > 0
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
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
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className={`cursor-pointer hover:bg-muted/50 ${selected.has(order.id) ? "bg-muted/30" : ""}`}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </TableCell>
                    <TableCell
                      className="font-medium"
                      onClick={() => {
                        setDetailOrder(order);
                        setDetailOpen(true);
                      }}
                    >
                      {order.number}
                    </TableCell>
                    <TableCell
                      onClick={() => {
                        setDetailOrder(order);
                        setDetailOpen(true);
                      }}
                    >
                      <div className="font-medium text-sm">
                        {shippingName(order)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {order.shipping.phone || order.billing.phone || ""}
                      </div>
                    </TableCell>
                    <TableCell
                      onClick={() => {
                        setDetailOrder(order);
                        setDetailOpen(true);
                      }}
                    >
                      <span className="font-medium text-sm">
                        {shippingCountry(order)}
                      </span>
                      {shippingCity(order) && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          / {shippingCity(order)}
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
                          <span
                            key={li.id}
                            className="truncate block max-w-[180px]"
                          >
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
                ))}
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
                  onClick={() => fetchOrders(page - 1)}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => fetchOrders(page + 1)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order #{detailOrder?.number}</DialogTitle>
            <DialogDescription>
              WC ID: {detailOrder?.id} | {detailOrder?.status}
            </DialogDescription>
          </DialogHeader>

          {detailOrder && (
            <div className="space-y-4 py-4">
              {/* Shipping Address */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Shipping Address</p>
                <div className="text-sm space-y-1">
                  <div className="font-medium">
                    {shippingName(detailOrder)}
                  </div>
                  <div>
                    {detailOrder.shipping.phone || detailOrder.billing.phone}
                  </div>
                  <div>
                    {detailOrder.shipping.address_1 ||
                      detailOrder.billing.address_1}
                  </div>
                  {(detailOrder.shipping.address_2 ||
                    detailOrder.billing.address_2) && (
                    <div>
                      {detailOrder.shipping.address_2 ||
                        detailOrder.billing.address_2}
                    </div>
                  )}
                  <div>
                    {[
                      shippingCity(detailOrder),
                      detailOrder.shipping.postcode ||
                        detailOrder.billing.postcode,
                      shippingCountry(detailOrder),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Items */}
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

              {/* Totals */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Shipping</div>
                <div className="text-right">
                  {detailOrder.shipping_total} {detailOrder.currency}
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

              {detailOrder.customer_note && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Customer Note</p>
                    <div className="text-sm rounded-md bg-muted p-3">
                      {detailOrder.customer_note}
                    </div>
                  </div>
                </>
              )}

              {/* Create Shipment Button */}
              <Button
                className="w-full"
                onClick={async () => {
                  setCreating(true);
                  try {
                    const res = await fetch("/api/shipments", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ wooOrderId: detailOrder.id }),
                    });
                    const json = await res.json();
                    if (json.error) {
                      toast.error(json.error);
                    } else {
                      toast.success(
                        `Shipment #${json.shipment.id} created`
                      );
                      setDetailOpen(false);
                    }
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Failed"
                    );
                  }
                  setCreating(false);
                }}
                disabled={creating}
              >
                <Truck className="size-4" />
                {creating ? "Creating..." : "Create Shipment"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
