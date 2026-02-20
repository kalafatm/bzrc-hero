import type { WooOrder } from "./woo-types";
import type { ShipmentCreate, ShipmentItemCreate } from "./shipping-types";

// Default shipper config
const DEFAULT_SHIPPER = {
  person_name: "Mehmet Kalafat",
  company_name: "",
  phone1: "+971501776194",
  email: "mehmet.kalafat@bazaarica.com",
  country_code: "TR",
  city: "Umraniye",
  line1: "Istanbul",
  line2: "Istanbul",
  post_code: "34771",
};

// Default Naqel credentials — can be overridden per request
const DEFAULT_CUSTOMER_CODE = process.env.NAQEL_CUSTOMER_CODE || "";
const DEFAULT_BRANCH_CODE = process.env.NAQEL_BRANCH_CODE || "";

interface MapOptions {
  customer_code?: string;
  branch_code?: string;
  product_type?: string;
  shipper?: {
    person_name: string;
    company_name?: string;
    phone1?: string;
    email?: string;
    country_code: string;
    city: string;
    line1: string;
  };
}

/**
 * Map a WooCommerce order to a ShipmentCreate payload for the remote API.
 */
export function mapWooOrderToShipment(
  order: WooOrder,
  options?: MapOptions
): ShipmentCreate {
  const shipping = order.shipping;
  const billing = order.billing;

  // Use shipping address, fall back to billing
  const addr = shipping.address_1 ? shipping : billing;
  const personName = `${addr.first_name} ${addr.last_name}`.trim();
  const phone = addr.phone || billing.phone || "";

  // Build items from line_items
  const items: ShipmentItemCreate[] = order.line_items.map((li) => ({
    quantity: li.quantity,
    weight_value: 0.5, // default 0.5 kg per item (no weight info from WC)
    weight_unit: 1,
    customs_value: Number(li.total) || li.price * li.quantity,
    customs_currency: order.currency,
    goods_description: li.name.substring(0, 100),
    commodity_code: li.sku || undefined,
    package_type: "Box",
    contains_dangerous_goods: false,
    woo_order_item_id: li.id,
    woo_product_id: li.product_id,
    woo_variation_id: li.variation_id || undefined,
  }));

  // Total weight = sum of item weights
  const totalWeight = items.reduce((sum, i) => sum + i.weight_value * i.quantity, 0);

  // Description of goods
  const descriptions = order.line_items.map((li) => li.name).join(", ");
  const descriptionOfGoods = descriptions.substring(0, 200) || "Cosmetic products";

  // COD: if payment method is "cod"
  const isCod = order.payment_method === "cod";

  const shipper = options?.shipper || DEFAULT_SHIPPER;

  return {
    woo_order_id: order.id,
    woo_order_number: order.number,
    customer_code: options?.customer_code || DEFAULT_CUSTOMER_CODE,
    branch_code: options?.branch_code || DEFAULT_BRANCH_CODE,
    product_type: options?.product_type || "DLV",
    description_of_goods: descriptionOfGoods,
    number_of_pieces: 1,
    shipping_datetime: new Date().toISOString(),
    cod_amount: isCod ? Number(order.total) : undefined,
    cod_currency: isCod ? order.currency : undefined,
    customs_declared_value: Number(order.total),
    customs_value_currency: order.currency,
    shipment_weight_value: totalWeight || 0.5,
    shipment_weight_unit: 1,
    shipper_reference1: order.number,
    include_label: true,
    include_office_details: true,
    consignee: {
      person_name: personName || "Customer",
      company_name: addr.company || undefined,
      phone1: phone,
      cell_phone: phone,
      email: billing.email || undefined,
      country_code: addr.country, // ISO2 from WC
      city: addr.city,
      line1: addr.address_1,
      line2: addr.address_2 || undefined,
      post_code: addr.postcode || undefined,
    },
    shipper: {
      person_name: shipper.person_name,
      company_name: shipper.company_name || undefined,
      phone1: shipper.phone1 || undefined,
      email: shipper.email || undefined,
      country_code: shipper.country_code,
      city: shipper.city,
      line1: shipper.line1,
      line2: ("line2" in shipper ? shipper.line2 : undefined) as string | undefined,
      post_code: ("post_code" in shipper ? shipper.post_code : undefined) as string | undefined,
    },
    items,
  };
}
