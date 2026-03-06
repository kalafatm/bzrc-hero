"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Save, RefreshCw, Loader2 } from "lucide-react";

interface CarrierConfig {
  carrierCode: string;
  carrierName: string;
  declaredValueMultiplier: number;
}

interface StoreInfo {
  id: string;
  name: string;
  baseUrl: string;
  active: boolean;
}

export default function SettingsPage() {
  // Carrier config state
  const [configs, setConfigs] = useState<CarrierConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [savingConfigs, setSavingConfigs] = useState(false);

  // Stores state
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  // Load carrier configs
  const loadConfigs = async () => {
    setLoadingConfigs(true);
    try {
      const res = await fetch("/api/settings/carrier-config");
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setConfigs(json.configs || []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load configs");
    }
    setLoadingConfigs(false);
  };

  // Load stores
  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const res = await fetch("/api/settings/stores");
      const json = await res.json();
      if (json.stores) setStores(json.stores);
    } catch {
      // Silent fail
    }
    setLoadingStores(false);
  };

  useEffect(() => {
    loadConfigs();
    loadStores();
  }, []);

  // Save carrier configs
  const handleSaveConfigs = async () => {
    setSavingConfigs(true);
    try {
      const res = await fetch("/api/settings/carrier-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setConfigs(json.configs || configs);
        toast.success("Carrier config saved to Google Sheets");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
    setSavingConfigs(false);
  };

  const updateMultiplier = (carrierCode: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setConfigs((prev) =>
      prev.map((c) =>
        c.carrierCode === carrierCode
          ? { ...c, declaredValueMultiplier: num }
          : c
      )
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Carrier configuration and order sources</p>
      </div>

      {/* Carrier Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Carrier Configuration</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              COD declared value multiplier per carrier (stored in Google Sheets)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadConfigs} disabled={loadingConfigs}>
              <RefreshCw className={`size-4 ${loadingConfigs ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={handleSaveConfigs} disabled={savingConfigs || loadingConfigs}>
              {savingConfigs ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingConfigs ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" /> Loading...
            </div>
          ) : configs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No carrier configs found in Google Sheets. Add rows to the &quot;carrierConfig&quot; tab.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[200px]">Declared Value Multiplier</TableHead>
                  <TableHead className="w-[120px]">Effect</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((c) => (
                  <TableRow key={c.carrierCode}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {c.carrierCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{c.carrierName}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        value={c.declaredValueMultiplier}
                        onChange={(e) => updateMultiplier(c.carrierCode, e.target.value)}
                        className="w-[120px] h-8"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.declaredValueMultiplier < 1
                        ? `${Math.round((1 - c.declaredValueMultiplier) * 100)}% reduction`
                        : c.declaredValueMultiplier === 1
                          ? "No change"
                          : `${Math.round((c.declaredValueMultiplier - 1) * 100)}% increase`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Sources</CardTitle>
          <p className="text-sm text-muted-foreground">
            WooCommerce stores for order syncing
          </p>
        </CardHeader>
        <CardContent>
          {loadingStores ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" /> Loading...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {s.baseUrl || "Not configured"}
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Coming Soon
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
