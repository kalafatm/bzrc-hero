// Types matching the remote Shipping Integration Service OpenAPI spec
// Server: http://135.181.215.44

// ── Consignee ──────────────────────────────────────────────────
export interface ConsigneeInfo {
  person_name: string;
  company_name?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  cell_phone?: string | null;
  email?: string | null;
  type?: string | null;
  civil_id?: string | null;
  country_code: string; // ISO2, exactly 2 chars
  city: string;
  district?: string | null;
  line1: string;
  line2?: string | null;
  line3?: string | null;
  post_code?: string | null;
  longitude?: string | null;
  latitude?: string | null;
  location_code1?: string | null;
  location_code2?: string | null;
  location_code3?: string | null;
  short_address?: string | null;
}

// ── Shipper ────────────────────────────────────────────────────
export interface ShipperInfo {
  person_name: string;
  company_name?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  cell_phone?: string | null;
  email?: string | null;
  type?: string | null;
  country_code: string; // ISO2, exactly 2 chars
  city: string;
  line1: string;
  line2?: string | null;
  line3?: string | null;
  post_code?: string | null;
  longitude?: string | null;
  latitude?: string | null;
  location_code1?: string | null;
  location_code2?: string | null;
  location_code3?: string | null;
}

// ── Shipment Item ──────────────────────────────────────────────
export interface ShipmentItemCreate {
  quantity: number;
  weight_value: number;
  weight_unit: number; // 1 = KG
  customs_value: number;
  customs_currency: string; // 3 chars, e.g. "TRY", "SAR"
  comments?: string | null;
  reference?: string | null;
  commodity_code?: string | null;
  goods_description: string;
  country_of_origin?: string | null; // ISO2, 2 chars
  package_type?: string | null;
  contains_dangerous_goods?: boolean;
  woo_order_item_id?: number | null;
  woo_product_id?: number | null;
  woo_variation_id?: number | null;
}

export interface ShipmentItemRead extends ShipmentItemCreate {
  id: number;
}

// ── Shipment ───────────────────────────────────────────────────
export interface ShipmentCreate {
  woo_order_id?: number | null;
  woo_order_number?: string | null;
  carrier_code?: string | null; // "naqel" | "smsa"
  customer_code: string;
  branch_code: string;
  product_type: string; // "DLV", "PUD"
  description_of_goods: string;
  number_of_pieces: number;
  shipping_datetime: string; // ISO8601
  due_date?: string | null;
  cod_amount?: number | null;
  cod_currency?: string | null; // 3 chars
  customs_declared_value?: number | null;
  customs_value_currency?: string | null; // 3 chars
  shipment_weight_value: number;
  shipment_weight_unit: number; // 1 = KG
  shipment_length?: number | null;
  shipment_width?: number | null;
  shipment_height?: number | null;
  shipment_dimension_unit?: number | null;
  shipper_reference1?: string | null;
  shipper_note1?: string | null;
  include_label?: boolean;
  include_office_details?: boolean;
  consignee: ConsigneeInfo;
  shipper: ShipperInfo;
  items: ShipmentItemCreate[];
}

export interface ShipmentRead {
  id: number;
  woo_order_id: number | null;
  woo_order_number: string | null;
  carrier_code: string | null;
  customer_code: string;
  branch_code: string;
  product_type: string;
  description_of_goods: string;
  number_of_pieces: number;
  shipping_datetime: string;
  due_date: string | null;
  cod_amount: number | null;
  cod_currency: string | null;
  customs_declared_value: number | null;
  customs_value_currency: string | null;
  shipment_weight_value: number;
  shipment_weight_unit: number;
  shipment_length: number | null;
  shipment_width: number | null;
  shipment_height: number | null;
  shipment_dimension_unit: number | null;
  shipper_reference1: string | null;
  shipper_note1: string | null;
  include_label: boolean;
  include_office_details: boolean;
  consignee: ConsigneeInfo;
  shipper: ShipperInfo;
  status: string;
  status_message?: string | null;
  airwaybill_number: string | null;
  tracking_number: string | null;
  label_base64: string | null;
  last_tracked_at: string | null;
  created_at: string;
  updated_at: string;
  items: ShipmentItemRead[];
}

// ── Tracking ─────────────────────────────────────────────────
export interface TrackingEvent {
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

export interface TrackingResponse {
  shipment_id: number;
  airwaybill_number: string;
  current_status: string;
  status_message?: string | null;
  events: TrackingEvent[];
  last_tracked_at: string | null;
}

export interface BulkTrackingResult {
  total_tracked: number;
  updated: number;
  errors: number;
  details: {
    shipment_id: number;
    awb: string;
    status?: string;
    new_events?: number;
    error?: string;
  }[];
}

// ── List query params ──────────────────────────────────────────
export interface ShipmentListParams {
  status_filter?: string;
  woo_order_id?: number;
  limit?: number;
  offset?: number;
}
