/**
 * City code fuzzy matching pipeline (Naqel + SMSA).
 *
 * Naqel: match against naqelCityCodes sheet (country + cityEN/cityAR)
 * SMSA:  match against SMSA offices cityName list (no country filter — SMSA serves fixed regions)
 *
 * Step 1: Exact match (case-insensitive)
 * Step 2: Fuzzy match (Levenshtein distance)
 * Step 3: Arabic Gemini fallback (if Arabic chars detected)
 * Step 4: Return results for operator confirmation
 */

import { distance } from "fastest-levenshtein";
import { matchArabicCity, containsNonLatin } from "./gemini";

export interface NaqelCityRow {
  countryCode: string;
  countryName: string;
  province: string;
  cityEN: string;
  cityAR: string;
  cityCode: string;
  countryCurrency: string;
  countryTradeCode: string;
  cityCodeNET: string;
}

export type MatchConfidence = "exact" | "fuzzy" | "gemini" | "none";

export interface CityMatchResult {
  confidence: MatchConfidence;
  matchedCity: NaqelCityRow | null;
  smsaCity?: string | null; // SMSA matched city name
  score: number; // 0-1, 1 = exact
  alternatives: { city: NaqelCityRow; score: number }[];
  smsaAlternatives?: { cityName: string; score: number }[];
  originalInput: string;
  carrier?: string;
}

/**
 * Calculate similarity score between 0 and 1 using Levenshtein distance.
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

/**
 * Run the full city matching pipeline.
 */
export async function matchCity(
  countryCode: string,
  cityName: string,
  allCities: NaqelCityRow[]
): Promise<CityMatchResult> {
  const input = cityName.trim();
  const country = countryCode.trim().toUpperCase();

  // Filter cities by country
  const countryCities = allCities.filter(
    (c) => c.countryCode.toUpperCase() === country
  );

  if (countryCities.length === 0) {
    return {
      confidence: "none",
      matchedCity: null,
      score: 0,
      alternatives: [],
      originalInput: input,
    };
  }

  // Step 1: Exact match against City [EN]
  const exactMatch = countryCities.find(
    (c) => c.cityEN.toLowerCase() === input.toLowerCase()
  );

  if (exactMatch) {
    return {
      confidence: "exact",
      matchedCity: exactMatch,
      score: 1,
      alternatives: [],
      originalInput: input,
    };
  }

  // Step 2: Fuzzy match against City [EN]
  const scored = countryCities
    .map((city) => ({
      city,
      score: similarity(input.toLowerCase(), city.cityEN.toLowerCase()),
    }))
    .sort((a, b) => b.score - a.score);

  const topFuzzy = scored.slice(0, 5);
  const bestFuzzy = topFuzzy[0];

  // If good fuzzy match (>= 0.7), return it
  if (bestFuzzy && bestFuzzy.score >= 0.7) {
    return {
      confidence: "fuzzy",
      matchedCity: bestFuzzy.city,
      score: bestFuzzy.score,
      alternatives: topFuzzy.slice(1, 4),
      originalInput: input,
    };
  }

  // Step 3: Arabic Gemini fallback
  if (containsNonLatin(input)) {
    try {
      // Get Arabic city names for this country
      const arabicCandidates = countryCities
        .filter((c) => c.cityAR && c.cityAR.trim() !== "")
        .map((c) => c.cityAR);

      if (arabicCandidates.length > 0) {
        const geminiMatch = await matchArabicCity(input, arabicCandidates);

        if (geminiMatch) {
          const matched = countryCities.find(
            (c) => c.cityAR.toLowerCase() === geminiMatch.toLowerCase()
          );

          if (matched) {
            return {
              confidence: "gemini",
              matchedCity: matched,
              score: 0.8,
              alternatives: topFuzzy.slice(0, 3),
              originalInput: input,
            };
          }
        }
      }
    } catch {
      // Gemini failed — continue to return fuzzy results
    }
  }

  // Step 4: Also try fuzzy match against Arabic city names
  if (containsNonLatin(input)) {
    const arabicScored = countryCities
      .filter((c) => c.cityAR && c.cityAR.trim() !== "")
      .map((city) => ({
        city,
        score: similarity(input, city.cityAR),
      }))
      .sort((a, b) => b.score - a.score);

    const bestArabic = arabicScored[0];
    if (bestArabic && bestArabic.score >= 0.6) {
      return {
        confidence: "fuzzy",
        matchedCity: bestArabic.city,
        score: bestArabic.score,
        alternatives: arabicScored.slice(1, 4),
        originalInput: input,
      };
    }
  }

  // No good match found
  return {
    confidence: "none",
    matchedCity: bestFuzzy?.city || null,
    score: bestFuzzy?.score || 0,
    alternatives: topFuzzy.slice(0, 4),
    originalInput: input,
  };
}

/**
 * SMSA city matching pipeline.
 * Uses Naqel's 4,449-row city list for fuzzy matching (same data, better coverage).
 * Returns cityEN as the SMSA city name (SMSA accepts free-text city names).
 */
export async function matchSmsaCity(
  countryCode: string,
  cityName: string,
  allCities: NaqelCityRow[]
): Promise<CityMatchResult> {
  const input = cityName.trim();
  const country = countryCode.trim().toUpperCase();

  // Filter cities by country
  const countryCities = allCities.filter(
    (c) => c.countryCode.toUpperCase() === country
  );

  if (countryCities.length === 0) {
    return {
      confidence: "none",
      matchedCity: null,
      smsaCity: null,
      score: 0,
      alternatives: [],
      smsaAlternatives: [],
      originalInput: input,
      carrier: "smsa",
    };
  }

  // Step 1: Exact match against cityEN
  const exactMatch = countryCities.find(
    (c) => c.cityEN.toLowerCase() === input.toLowerCase()
  );

  if (exactMatch) {
    return {
      confidence: "exact",
      matchedCity: exactMatch,
      smsaCity: exactMatch.cityEN,
      score: 1,
      alternatives: [],
      smsaAlternatives: [],
      originalInput: input,
      carrier: "smsa",
    };
  }

  // Step 2: Fuzzy match against cityEN
  const scored = countryCities
    .map((city) => ({
      city,
      score: similarity(input.toLowerCase(), city.cityEN.toLowerCase()),
    }))
    .sort((a, b) => b.score - a.score);

  const topFuzzy = scored.slice(0, 5);
  const bestFuzzy = topFuzzy[0];

  if (bestFuzzy && bestFuzzy.score >= 0.7) {
    return {
      confidence: "fuzzy",
      matchedCity: bestFuzzy.city,
      smsaCity: bestFuzzy.city.cityEN,
      score: bestFuzzy.score,
      alternatives: topFuzzy.slice(1, 4),
      smsaAlternatives: topFuzzy.slice(1, 4).map((s) => ({ cityName: s.city.cityEN, score: s.score })),
      originalInput: input,
      carrier: "smsa",
    };
  }

  // Step 3: Arabic Gemini fallback
  if (containsNonLatin(input)) {
    try {
      const arabicCandidates = countryCities
        .filter((c) => c.cityAR && c.cityAR.trim() !== "")
        .map((c) => c.cityAR);

      if (arabicCandidates.length > 0) {
        const topCandidates = arabicCandidates.slice(0, 30);
        const geminiMatch = await matchArabicCity(input, topCandidates);
        if (geminiMatch) {
          const matched = countryCities.find(
            (c) => c.cityAR.toLowerCase() === geminiMatch.toLowerCase()
          );
          if (matched) {
            return {
              confidence: "gemini",
              matchedCity: matched,
              smsaCity: matched.cityEN,
              score: 0.8,
              alternatives: topFuzzy.slice(0, 3),
              smsaAlternatives: topFuzzy.slice(0, 3).map((s) => ({ cityName: s.city.cityEN, score: s.score })),
              originalInput: input,
              carrier: "smsa",
            };
          }
        }
      }
    } catch {
      // Gemini failed — continue
    }

    // Step 4: Fuzzy match against Arabic city names
    const arabicScored = countryCities
      .filter((c) => c.cityAR && c.cityAR.trim() !== "")
      .map((city) => ({
        city,
        score: similarity(input, city.cityAR),
      }))
      .sort((a, b) => b.score - a.score);

    const bestArabic = arabicScored[0];
    if (bestArabic && bestArabic.score >= 0.6) {
      return {
        confidence: "fuzzy",
        matchedCity: bestArabic.city,
        smsaCity: bestArabic.city.cityEN,
        score: bestArabic.score,
        alternatives: arabicScored.slice(1, 4),
        smsaAlternatives: arabicScored.slice(1, 4).map((s) => ({ cityName: s.city.cityEN, score: s.score })),
        originalInput: input,
        carrier: "smsa",
      };
    }
  }

  // No good match
  return {
    confidence: "none",
    matchedCity: bestFuzzy?.city || null,
    smsaCity: bestFuzzy?.city.cityEN || null,
    score: bestFuzzy?.score || 0,
    alternatives: topFuzzy.slice(0, 4),
    smsaAlternatives: topFuzzy.slice(0, 4).map((s) => ({ cityName: s.city.cityEN, score: s.score })),
    originalInput: input,
    carrier: "smsa",
  };
}
