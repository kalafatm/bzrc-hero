import type { WooOrder } from "./woo-types";
import type { ShipmentCreate, ShipmentItemCreate } from "./shipping-types";

// Default shipper config
const DEFAULT_SHIPPER = {
  person_name: "Mehmet Kalafat",
  company_name: "",
  phone1: "+971501776194",
  email: "mehmet.kalafat@bazaarica.com",
  country_code: "TR",
  city: "Istanbul",
  line1: "Istanbul",
  line2: "Istanbul",
  post_code: "34771",
};

// Default Naqel credentials — can be overridden per request
const DEFAULT_CUSTOMER_CODE = process.env.NAQEL_CUSTOMER_CODE || "";
const DEFAULT_BRANCH_CODE = process.env.NAQEL_BRANCH_CODE || "";

// Approximate USD rates for $10-12 threshold conversion (precision not critical)
const USD_RATES: Record<string, number> = {
  USD: 1, SAR: 3.75, AED: 3.67, KWD: 0.31, BHD: 0.376, QAR: 3.64,
  OMR: 0.385, TRY: 38, EUR: 0.92, GBP: 0.79, EGP: 50, JOD: 0.71,
};

function usdToLocal(usd: number, currency: string): number {
  return usd * (USD_RATES[currency.toUpperCase()] || 1);
}

// Country ISO2 → phone dialing code
const COUNTRY_DIAL_CODES: Record<string, string> = {
  AE: "971", SA: "966", KW: "965", BH: "973", QA: "974", OM: "968",
  JO: "962", IQ: "964", EG: "20", LB: "961", MA: "212", ZA: "27",
  TR: "90", US: "1", GB: "44", DE: "49", FR: "33", IN: "91",
  PK: "92", CN: "86", JP: "81", KR: "82", RU: "7",
};

/**
 * Sanitize phone number: strip ".00", non-digits, and ensure + prefix with country code.
 */
function sanitizePhone(raw: string, countryCode: string): string {
  // Strip ".00" or ".0" suffix, then keep only digits and +
  let phone = raw.replace(/\.0+$/, "").replace(/[^\d+]/g, "");
  if (!phone) return "";

  const dialCode = COUNTRY_DIAL_CODES[countryCode.toUpperCase()] || "";

  // Already has + prefix → done
  if (phone.startsWith("+")) return phone;

  // Starts with country dial code → add +
  if (dialCode && phone.startsWith(dialCode)) {
    return "+" + phone;
  }

  // Starts with 00 + country code (international format) → replace 00 with +
  if (dialCode && phone.startsWith("00" + dialCode)) {
    return "+" + phone.substring(2);
  }

  // Local number → prepend +dialCode
  if (dialCode) {
    // Strip leading 0 (local format)
    if (phone.startsWith("0")) phone = phone.substring(1);
    return "+" + dialCode + phone;
  }

  return phone;
}

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
  carrier_code?: string;
  customer_code?: string;
  branch_code?: string;
  product_type?: string;
  cityCode?: string;
  countryCurrency?: string;
  convertedTotal?: number;
  declaredValueMultiplier?: number; // carrier-specific multiplier for customs declared value (COD)
  originCityCode?: string; // 3-letter origin city code from exitLocation sheet (e.g. "IST")
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
  const rawPhone = addr.phone || billing.phone || "";
  const phone = sanitizePhone(rawPhone, addr.country);

  // Determine customs currency and values
  const customsCurrency = options?.countryCurrency || order.currency;
  const orderTotal = Number(order.total);

  // If converted total provided, calculate ratio for per-item conversion
  const conversionRatio =
    options?.convertedTotal && orderTotal > 0
      ? options.convertedTotal / orderTotal
      : 1;

  // COD check — determines which multiplier to use
  const isCod = order.payment_method === "cod";

  // Declared value multiplier:
  // - COD: carrier-specific from config (e.g. 0.85 naqel, 0.8 smsa)
  // - Credit card: always 25%
  const dvMultiplier = isCod ? (options?.declaredValueMultiplier ?? 1) : 0.25;

  // $10-12 USD threshold in destination currency (for credit card floor)
  const min10Local = usdToLocal(10, customsCurrency);
  const max12Local = usdToLocal(12, customsCurrency);

  // Build items from line_items
  const itemCount = order.line_items.length || 1;
  const items: ShipmentItemCreate[] = order.line_items.map((li) => {
    let itemValue = Number(li.total) || li.price * li.quantity;
    let itemCustomsValue = Math.round(itemValue * conversionRatio * dvMultiplier * 100) / 100;

    // Credit card: if per-item value too low, apply $10-12 USD floor distributed across items
    if (!isCod) {
      const minPerItem = min10Local / itemCount;
      if (itemCustomsValue < minPerItem) {
        const maxPerItem = max12Local / itemCount;
        itemCustomsValue = Math.round((minPerItem + Math.random() * (maxPerItem - minPerItem)) * 100) / 100;
      }
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

  // COD amount (full order total in destination currency, no reduction)
  const codAmount = isCod
    ? Math.round(orderTotal * conversionRatio * 100) / 100
    : undefined;

  // Customs declared value (total, in destination currency)
  // COD: carrier config multiplier | Credit card: 25%
  let customsDeclaredValue =
    options?.convertedTotal != null
      ? Math.round(options.convertedTotal * dvMultiplier * 100) / 100
      : Math.round(orderTotal * dvMultiplier * 100) / 100;

  // Credit card: $10-12 USD minimum floor
  if (!isCod && customsDeclaredValue < min10Local) {
    customsDeclaredValue = Math.round((min10Local + Math.random() * (max12Local - min10Local)) * 100) / 100;
  }

  const shipper = options?.shipper || DEFAULT_SHIPPER;

  // Consignee city: use matched city code if provided, otherwise raw city from WC
  const consigneeCity = options?.cityCode || addr.city;

  return {
    woo_order_id: order.id,
    woo_order_number: order.number,
    carrier_code: options?.carrier_code || "naqel",
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
      city: options?.originCityCode || shipper.city,
      line1: shipper.line1,
      line2: ("line2" in shipper ? shipper.line2 : undefined) as string | undefined,
      post_code: ("post_code" in shipper ? shipper.post_code : undefined) as string | undefined,
    },
    items,
  };
}
