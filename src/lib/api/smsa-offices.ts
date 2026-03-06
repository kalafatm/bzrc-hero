/**
 * Fetch and cache SMSA offices list from SMSA API.
 * Used for SMSA city code matching.
 */

export interface SmsaOffice {
  code: string;
  cityName: string;
  address: string;
  addressAR: string;
  latitude: string;
  longitude: string;
  morningShiftStart?: string;
  morningShiftEnd?: string;
  eveningShiftStart?: string;
  eveningShiftEnd?: string;
}

// In-memory cache (server-side, survives across API route calls)
let cachedOffices: SmsaOffice[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch SMSA offices from SMSA API, with 1h in-memory cache.
 */
export async function getSmsaOffices(): Promise<SmsaOffice[]> {
  if (cachedOffices && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedOffices;
  }

  const baseUrl = process.env.SMSA_BASE_URL || "https://ecomapis.smsaexpress.com";
  const apiKey = process.env.SMSA_API_KEY || "";

  if (!apiKey) {
    throw new Error("SMSA_API_KEY not configured");
  }

  const res = await fetch(`${baseUrl}/api/lookup/smsaoffices`, {
    headers: { apikey: apiKey },
  });

  if (!res.ok) {
    throw new Error(`SMSA offices API error: ${res.status} ${res.statusText}`);
  }

  const data: SmsaOffice[] = await res.json();
  cachedOffices = data;
  cacheTimestamp = Date.now();
  return data;
}

/**
 * Extract unique city names from SMSA offices.
 * Returns array of { cityName, officeCount } sorted by city name.
 */
export function getUniqueSmsaCities(offices: SmsaOffice[]): string[] {
  const citySet = new Set<string>();
  for (const office of offices) {
    if (office.cityName?.trim()) {
      citySet.add(office.cityName.trim());
    }
  }
  return Array.from(citySet).sort();
}
