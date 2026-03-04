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

/**
 * Determine Naqel product type from origin/destination country.
 * Same country = domestic (DOMN), different = international (DLVI).
 */
export function getProductType(originCountry: string, destCountry: string): string {
  const origin = (originCountry || "").toUpperCase();
  const dest = (destCountry || "").toUpperCase();
  if (origin && dest && origin === dest) return "DOMN";
  return "DLVI";
}

interface MapOptions {
  customer_code?: string;
  branch_code?: string;
  product_type?: string;
  cityCode?: string;
  countryCurrency?: string;
  convertedTotal?: number;
  declaredValueMultiplier?: number; // carrier-specific multiplier for customs declared value (COD)
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
 * If convertedTotal + countryCurrency provided, uses those for customs values.
 * If cityCode provided, uses it for consignee city.
 * Auto-translates Arabic/non-Latin fields via Gemini (names → transliterate, addresses → translate).
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

  // Determine customs currency and values
  const customsCurrency = options?.countryCurrency || order.currency;
  const orderTotal = Number(order.total);

  // If converted total provided, calculate ratio for per-item conversion
  const conversionRatio =
    options?.convertedTotal && orderTotal > 0
      ? options.convertedTotal / orderTotal
      : 1;

  // Declared value multiplier (carrier-specific, only for COD orders)
  const dvMultiplier = options?.declaredValueMultiplier ?? 1;

  // Build items from line_items
  const itemCount = order.line_items.length || 1;
  const items: ShipmentItemCreate[] = order.line_items.map((li) => {
    let itemValue = Number(li.total) || li.price * li.quantity;
    let itemCustomsValue = Math.round(itemValue * conversionRatio * dvMultiplier * 100) / 100;

    // If item value too low ($0.01 orders), distribute the minimum $10-12 across items
    const minPerItem = (10 * conversionRatio) / itemCount;
    if (itemCustomsValue < minPerItem) {
      const minVal = (10 * conversionRatio) / itemCount;
      const maxVal = (12 * conversionRatio) / itemCount;
      itemCustomsValue = Math.round((minVal + Math.random() * (maxVal - minVal)) * 100) / 100;
    }

    return {
      quantity: li.quantity,
      weight_value: 0.5, // default 0.5 kg per item (no weight info from WC)
      weight_unit: 1,
      customs_value: itemCustomsValue,
      customs_currency: customsCurrency,
      goods_description: li.name.substring(0, 100),
      commodity_code: li.sku || undefined,
      package_type: "Box",
      contains_dangerous_goods: false,
      woo_order_item_id: li.id,
      woo_product_id: li.product_id,
      woo_variation_id: li.variation_id || undefined,
    };
  });

  // Description of goods (already translated at order fetch time)
  const descriptions = order.line_items.map((li) => li.name).join(", ");
  const descriptionOfGoods = descriptions.substring(0, 200) || "Cosmetic products";

  // COD: if payment method is "cod"
  const isCod = order.payment_method === "cod";
  const codAmount = isCod
    ? Math.round(orderTotal * conversionRatio * 100) / 100
    : undefined;

  // Customs declared value (total, in destination currency, with carrier multiplier)
  // If value is under $10-equivalent (e.g. $0.01 placeholder orders), use random $10-12 converted to dest currency
  let customsDeclaredValue =
    options?.convertedTotal != null
      ? Math.round(options.convertedTotal * dvMultiplier * 100) / 100
      : Math.round(orderTotal * dvMultiplier * 100) / 100;

  if (customsDeclaredValue < 10 * conversionRatio) {
    const minValue = 10 * conversionRatio;
    const maxValue = 12 * conversionRatio;
    customsDeclaredValue = Math.round((minValue + Math.random() * (maxValue - minValue)) * 100) / 100;
  }

  const shipper = options?.shipper || DEFAULT_SHIPPER;

  // Consignee city: use matched city code if provided, otherwise raw city from WC
  const consigneeCity = options?.cityCode || addr.city;

  return {
    woo_order_id: order.id,
    woo_order_number: order.number,
    customer_code: options?.customer_code || DEFAULT_CUSTOMER_CODE,
    branch_code: options?.branch_code || DEFAULT_BRANCH_CODE,
    product_type: options?.product_type || getProductType(shipper.country_code, addr.country),
    description_of_goods: descriptionOfGoods,
    number_of_pieces: 1,
    shipping_datetime: new Date().toISOString(),
    cod_amount: codAmount,
    cod_currency: isCod ? customsCurrency : undefined,
    customs_declared_value: customsDeclaredValue,
    customs_value_currency: customsCurrency,
    shipment_weight_value: 0.5, // always 0.5 kg
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
      city: consigneeCity,
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
