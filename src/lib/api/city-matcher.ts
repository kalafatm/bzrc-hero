/**
 * Naqel city code fuzzy matching pipeline.
 *
 * Step 1: Exact match (country + city EN, case-insensitive)
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
  score: number; // 0-1, 1 = exact
  alternatives: { city: NaqelCityRow; score: number }[];
  originalInput: string;
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
