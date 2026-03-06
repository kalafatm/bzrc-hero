// WooCommerce REST API types (subset needed for shipping integration)

export interface WooAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string; // ISO2 code
  email?: string;
  phone?: string;
}

export interface WooLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  subtotal: string;
  total: string;
  sku: string;
  price: number;
  meta_data: WooMeta[];
}

export interface WooShippingLine {
  id: number;
  method_title: string;
  method_id: string;
  total: string;
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
  date_modified: string;
  total: string;
  subtotal?: string;
  shipping_total: string;
  discount_total: string;
  payment_method: string;
  payment_method_title: string;
  customer_id: number;
  customer_note: string;
  billing: WooAddress;
  shipping: WooAddress;
  line_items: WooLineItem[];
  shipping_lines: WooShippingLine[];
  meta_data: WooMeta[];
}

export interface WooProduct {
  id: number;
  name: string;
  sku: string;
  regular_price: string;
  price: string;
}

export interface WooListParams {
  page?: number;
  per_page?: number;
  status?: string | string[];
  after?: string;
  modified_after?: string;
  orderby?: string;
  order?: "asc" | "desc";
}
