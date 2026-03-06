"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Truck,
  Languages,
  MapPin,
  Save,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  StatusBadge,
  hasNonLatin,
  getCarrierFromMeta,
  isRouteValid,
  CARRIERS,
  CONFIDENCE_COLORS,
} from "./order-types";
import type {
  WooAddress,
  WooOrder,
  CityMatchResult,
} from "./order-types";

// ── Address Editor ───────────────────────────────────────────
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
              value={f.key === "phone" ? (address[f.key] || "").replace(/\.0+$/, "") : (address[f.key] || "")}
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

// ── Props ────────────────────────────────────────────────────
export interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Order state
  detailOrder: WooOrder | null;
  editedShipping: WooAddress | null;
  setEditedShipping: React.Dispatch<React.SetStateAction<WooAddress | null>>;
  editedBilling: WooAddress | null;
  setEditedBilling: React.Dispatch<React.SetStateAction<WooAddress | null>>;
  editedNote: string;
  setEditedNote: (note: string) => void;
  selectedCarrier: string;
  setSelectedCarrier: (carrier: string) => void;
  // City match
  cityMatch: CityMatchResult | null;
  setCityMatch: (match: CityMatchResult | null) => void;
  matchingCity: boolean;
  manualCityCode: string;
  setManualCityCode: (code: string) => void;
  // Reference data
  orderShipmentMap: Record<number, string>;
  countryCurrencyMap: Record<string, string>;
  exitDataLoaded: boolean;
  validDestinations: Set<string>;
  // Flags
  saving: boolean;
  creating: boolean;
  translating: boolean;
  // Handlers
  onMatchCity: () => void;
  onAutoMatchCity: (country: string, city: string, carrier?: string) => void;
  onTranslate: (fields: Record<string, string>, target: "shipping" | "billing") => void;
  onSaveToWC: () => void;
  onCreateShipment: () => void;
}

export function OrderDetailDialog(props: OrderDetailDialogProps) {
  const {
    open,
    onOpenChange,
    detailOrder,
    editedShipping,
    setEditedShipping,
    editedBilling,
    setEditedBilling,
    editedNote,
    setEditedNote,
    selectedCarrier,
    setSelectedCarrier,
    cityMatch,
    setCityMatch,
    matchingCity,
    manualCityCode,
    setManualCityCode,
    orderShipmentMap,
    countryCurrencyMap,
    exitDataLoaded,
    validDestinations,
    saving,
    creating,
    translating,
    onMatchCity,
    onAutoMatchCity,
    onTranslate,
    onSaveToWC,
    onCreateShipment,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  if (field === "city" || field === "country") {
                    setCityMatch(null);
                    setManualCityCode("");
                  }
                }}
                prefix="Shipping Address"
                onTranslate={(fields) => onTranslate(fields, "shipping")}
                translating={translating}
              />

              {/* City Code Match Section */}
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {selectedCarrier === "smsa" ? "SMSA" : "Naqel"} City Match
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onMatchCity}
                    disabled={matchingCity || !editedShipping.city || (!editedShipping.country && selectedCarrier !== "smsa")}
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
                      {cityMatch.carrier === "smsa" ? (
                        cityMatch.smsaCity ? (
                          <span className="text-sm font-medium">
                            {cityMatch.smsaCity}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">No SMSA match</span>
                        )
                      ) : cityMatch.matchedCity ? (
                        <span className="text-sm font-medium">
                          {cityMatch.matchedCity.cityEN} &rarr; {cityMatch.matchedCity.cityCode}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">No match</span>
                      )}
                    </div>

                    {/* SMSA alternatives dropdown */}
                    {cityMatch.carrier === "smsa" && cityMatch.smsaAlternatives && cityMatch.smsaAlternatives.length > 0 && cityMatch.confidence !== "exact" && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Alternatives:</p>
                        <Select
                          value={manualCityCode || cityMatch.smsaCity || ""}
                          onValueChange={(val) => setManualCityCode(val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select alternative" />
                          </SelectTrigger>
                          <SelectContent>
                            {cityMatch.smsaCity && (
                              <SelectItem value={cityMatch.smsaCity}>
                                {cityMatch.smsaCity}
                              </SelectItem>
                            )}
                            {cityMatch.smsaAlternatives.map((alt) => (
                              <SelectItem key={alt.cityName} value={alt.cityName}>
                                {alt.cityName} — {Math.round(alt.score * 100)}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Naqel alternatives dropdown */}
                    {cityMatch.carrier !== "smsa" && cityMatch.alternatives.length > 0 && cityMatch.confidence !== "exact" && (
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
                      <Label className="text-xs whitespace-nowrap">
                        {cityMatch.carrier === "smsa" ? "Manual city:" : "Manual code:"}
                      </Label>
                      <Input
                        value={manualCityCode}
                        onChange={(e) => setManualCityCode(e.target.value)}
                        placeholder={cityMatch.carrier === "smsa" ? "Enter SMSA city name" : "Enter city code"}
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
              <Button className="w-full" variant="outline" onClick={onSaveToWC} disabled={saving}>
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
                onTranslate={(fields) => onTranslate(fields, "billing")}
                translating={translating}
              />

              <Button className="w-full" variant="outline" onClick={onSaveToWC} disabled={saving}>
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
                <Select
                  value={selectedCarrier}
                  onValueChange={(val) => {
                    setSelectedCarrier(val);
                    if (val !== selectedCarrier && editedShipping?.city) {
                      setCityMatch(null);
                      setManualCityCode("");
                      onAutoMatchCity(
                        editedShipping?.country || "",
                        editedShipping.city,
                        val || undefined
                      );
                    }
                  }}
                >
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
                      : cityMatch?.carrier === "smsa"
                        ? cityMatch.smsaCity && cityMatch.confidence !== "none"
                          ? cityMatch.smsaCity
                          : cityMatch?.confidence === "none"
                            ? <span className="text-red-600">Low confidence ({Math.round((cityMatch?.score || 0) * 100)}%)</span>
                            : <span className="text-orange-600">Not matched yet</span>
                        : cityMatch?.matchedCity && cityMatch.confidence !== "none"
                          ? cityMatch.matchedCity.cityCode
                          : cityMatch?.confidence === "none"
                            ? <span className="text-red-600">Low confidence ({Math.round((cityMatch?.score || 0) * 100)}%)</span>
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
                const hasCityCode = !!manualCityCode || (
                  cityMatch?.carrier === "smsa"
                    ? !!cityMatch?.smsaCity && cityMatch.confidence !== "none"
                    : !!cityMatch?.matchedCity && cityMatch.confidence !== "none"
                );
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
                    {!cityMatch?.matchedCity && !cityMatch?.smsaCity && !manualCityCode && (
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
                onClick={onSaveToWC}
                disabled={saving}
              >
                <Save className="size-4" />
                {saving ? "Saving..." : "Save Carrier & City Code to WC"}
              </Button>

              {/* Create Shipment Button */}
              <Button
                className="w-full"
                onClick={onCreateShipment}
                disabled={
                  creating ||
                  !selectedCarrier ||
                  (!manualCityCode && !(
                    cityMatch?.carrier === "smsa"
                      ? cityMatch?.smsaCity && cityMatch.confidence !== "none"
                      : cityMatch?.matchedCity && cityMatch.confidence !== "none"
                  )) ||
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
  );
}
