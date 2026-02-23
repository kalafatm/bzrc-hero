"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Package, Truck, Send, AlertCircle, Navigation, CheckCircle } from "lucide-react";

interface Stats {
  total: number;
  draft: number;
  submitted: number;
  in_transit: number;
  delivered: number;
  failed: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    draft: 0,
    submitted: 0,
    in_transit: 0,
    delivered: 0,
    failed: 0,
  });

  useEffect(() => {
    // Fetch shipment stats from remote API
    fetch("/api/shipments?limit=200")
      .then((r) => r.json())
      .then((json) => {
        const shipments = json.shipments || [];
        setStats({
          total: shipments.length,
          draft: shipments.filter(
            (s: { status: string }) =>
              s.status === "draft" || s.status === "pending"
          ).length,
          submitted: shipments.filter(
            (s: { status: string }) => s.status === "submitted"
          ).length,
          in_transit: shipments.filter(
            (s: { status: string }) => s.status === "in_transit"
          ).length,
          delivered: shipments.filter(
            (s: { status: string }) => s.status === "delivered"
          ).length,
          failed: shipments.filter(
            (s: { status: string }) => s.status === "failed"
          ).length,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          bzrcMaster - Naqel Shipping Module
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Shipments
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All shipments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">
              Ready to submit
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Submitted
            </CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.submitted}</div>
            <p className="text-xs text-muted-foreground">
              AWB assigned
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <Navigation className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.in_transit}</div>
            <p className="text-xs text-muted-foreground">
              On the way
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.delivered}</div>
            <p className="text-xs text-muted-foreground">
              Completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">
              Needs attention
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            1. Go to <strong>Orders</strong> to browse WooCommerce orders
          </p>
          <p>
            2. Select orders and click <strong>Create Shipment</strong> to push them to the shipping API
          </p>
          <p>
            3. Go to <strong>Shipments</strong> to review and <strong>Submit</strong> to Naqel
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
