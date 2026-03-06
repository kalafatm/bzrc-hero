/**
 * WooCommerce store configurations.
 * Each store has its own WC REST API credentials.
 * Credentials come from environment variables.
 */

export interface StoreConfig {
  id: string;
  name: string;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  active: boolean;
}

export function getStores(): StoreConfig[] {
  return [
    {
      id: "bazaarica",
      name: "Bazaarica",
      baseUrl: process.env.WOO_BASE_URL || "",
      consumerKey: process.env.WOO_CONSUMER_KEY || "",
      consumerSecret: process.env.WOO_CONSUMER_SECRET || "",
      active: true,
    },
    {
      id: "shopnb",
      name: "ShopNB",
      baseUrl: process.env.SHOPNB_BASE_URL || "",
      consumerKey: process.env.SHOPNB_CONSUMER_KEY || "",
      consumerSecret: process.env.SHOPNB_CONSUMER_SECRET || "",
      active: !!(process.env.SHOPNB_BASE_URL && process.env.SHOPNB_CONSUMER_KEY),
    },
  ];
}

export function getActiveStore(storeId?: string): StoreConfig {
  const stores = getStores();
  if (storeId) {
    const found = stores.find((s) => s.id === storeId && s.active);
    if (found) return found;
  }
  return stores.find((s) => s.active)!;
}
