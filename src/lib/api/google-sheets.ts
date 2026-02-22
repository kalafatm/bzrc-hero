/**
 * Google Sheets API client for reference data.
 * Uses raw fetch + JWT auth — zero heavy dependencies.
 * Fetches 3 sheets: exitLocation, naqelCityCodes, currencyCodes
 * In-memory cache with 6-hour refresh.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { NaqelCityRow } from "./city-matcher";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "";

// ── Types ──────────────────────────────────────────────────────

export interface ExitLocationRow {
  exitCountry: string;
  exitLocationCode: string;
  destinationCountry: string;
}

export interface CurrencyCodeRow {
  code: string;
  currency: string;
  description: string;
}

export interface SheetData {
  exitLocations: ExitLocationRow[];
  naqelCityCodes: NaqelCityRow[];
  currencyCodes: CurrencyCodeRow[];
  fetchedAt: string;
}

// ── Cache ──────────────────────────────────────────────────────

let cachedData: SheetData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Token cache
let cachedToken: string | null = null;
let tokenExpiry = 0;

// ── JWT Auth (raw, no heavy deps) ──────────────────────────────

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function loadServiceAccountKey(): ServiceAccountKey {
  const keyFilePath = path.resolve(process.cwd(), KEY_FILE);
  const raw = fs.readFileSync(keyFilePath, "utf-8");
  return JSON.parse(raw) as ServiceAccountKey;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken;
  }

  const key = loadServiceAccountKey();
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(key.private_key, "base64url");

  const jwt = `${signInput}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google OAuth error: ${res.status} — ${body.substring(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = now + data.expires_in;

  return cachedToken;
}

// ── Fetch helpers ──────────────────────────────────────────────

async function fetchSheet(sheetName: string): Promise<string[][]> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A:Z`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API error: ${res.status} — ${body.substring(0, 300)}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values || [];
}

function parseExitLocations(rows: string[][]): ExitLocationRow[] {
  // Skip header row
  return rows.slice(1).map((row) => ({
    exitCountry: (row[0] || "").trim(),
    exitLocationCode: (row[1] || "").trim(),
    destinationCountry: (row[2] || "").trim(),
  })).filter((r) => r.exitCountry && r.exitLocationCode);
}

function parseNaqelCityCodes(rows: string[][]): NaqelCityRow[] {
  // Header: Country Code, Country Name, Province, City [EN], City [AR], City Code,
  //         Country Currency, Country Trade Code, (empty), City Code NET
  return rows.slice(1).map((row) => ({
    countryCode: (row[0] || "").trim(),
    countryName: (row[1] || "").trim(),
    province: (row[2] || "").trim(),
    cityEN: (row[3] || "").trim(),
    cityAR: (row[4] || "").trim(),
    cityCode: (row[5] || "").trim(),
    countryCurrency: (row[6] || "").trim(),
    countryTradeCode: (row[7] || "").trim(),
    cityCodeNET: (row[9] || "").trim(), // column 8 is empty, 9 is City Code NET
  })).filter((r) => r.countryCode && r.cityCode);
}

function parseCurrencyCodes(rows: string[][]): CurrencyCodeRow[] {
  // Header: Code, Currency, Currency Description
  return rows.slice(1).map((row) => ({
    code: (row[0] || "").trim(),
    currency: (row[1] || "").trim(),
    description: (row[2] || "").trim(),
  })).filter((r) => r.code);
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Get all reference data from Google Sheets.
 * Uses in-memory cache with 6-hour TTL.
 */
export async function getSheetData(forceRefresh = false): Promise<SheetData> {
  const now = Date.now();

  if (!forceRefresh && cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData;
  }

  const [exitRows, cityRows, currencyRows] = await Promise.all([
    fetchSheet("exitLocation"),
    fetchSheet("naqelCityCodes"),
    fetchSheet("currencyCodes"),
  ]);

  cachedData = {
    exitLocations: parseExitLocations(exitRows),
    naqelCityCodes: parseNaqelCityCodes(cityRows),
    currencyCodes: parseCurrencyCodes(currencyRows),
    fetchedAt: new Date().toISOString(),
  };
  cacheTimestamp = now;

  return cachedData;
}

/**
 * Get Naqel city codes only (convenience).
 */
export async function getNaqelCityCodes(): Promise<NaqelCityRow[]> {
  const data = await getSheetData();
  return data.naqelCityCodes;
}

/**
 * Look up exit location for a country pair.
 */
export async function getExitLocation(
  exitCountry: string,
  destinationCountry: string
): Promise<ExitLocationRow | null> {
  const data = await getSheetData();
  return (
    data.exitLocations.find(
      (r) =>
        r.exitCountry.toUpperCase() === exitCountry.toUpperCase() &&
        r.destinationCountry.toUpperCase() === destinationCountry.toUpperCase()
    ) || null
  );
}

/**
 * Get the destination currency for a country from naqelCityCodes.
 */
export async function getCountryCurrency(countryCode: string): Promise<string | null> {
  const data = await getSheetData();
  const row = data.naqelCityCodes.find(
    (r) => r.countryCode.toUpperCase() === countryCode.toUpperCase()
  );
  return row?.countryCurrency || null;
}
