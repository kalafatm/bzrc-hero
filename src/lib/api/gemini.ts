/**
 * Gemini API client for translation and Arabic city matching.
 * Pure 1:1 translation only — no AI interpretation.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${body.substring(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text;
}

/**
 * Detect if text contains non-Latin characters (Arabic, Turkish special chars, etc.)
 */
export function containsNonLatin(text: string): boolean {
  // Arabic Unicode range + some extended ranges
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Detect if text is likely non-English (contains Arabic, Cyrillic, CJK, etc.)
 */
export function isNonEnglish(text: string): boolean {
  // Arabic
  if (/[\u0600-\u06FF]/.test(text)) return true;
  // Cyrillic
  if (/[\u0400-\u04FF]/.test(text)) return true;
  // CJK
  if (/[\u4E00-\u9FFF]/.test(text)) return true;
  // Turkish special chars that suggest Turkish text
  // (not reliable alone, but combined with other heuristics)
  return false;
}

/**
 * Transliterate a person's name from non-Latin script to Latin script.
 * Pure phonetic transliteration — never translate the meaning.
 * e.g. "هداية" → "Hedaye", NOT "Gift"
 */
export async function transliterateName(text: string): Promise<string> {
  if (!text || text.trim().length === 0) return text;

  const prompt = `Transliterate the following person's name from its original script to Latin/English letters.
This is a PERSON'S NAME — do NOT translate its meaning. Only convert the script phonetically.
For example: "هداية" → "Hedaye" (NOT "Gift"), "حسين" → "Hussein" (NOT any English word), "نادية" → "Nadia".
Return ONLY the transliterated name, nothing else. No quotes, no explanation.

Name: "${text}"`;

  return callGemini(prompt);
}

/**
 * Translate address/location text to English, preserving proper nouns via transliteration.
 * e.g. "شارع الحسين" → "Al-Hussein Street" (name kept, word translated)
 */
export async function translateAddress(text: string): Promise<string> {
  if (!text || text.trim().length === 0) return text;

  const prompt = `Translate the following address/location text to English.
RULES:
- Translate generic words (street, building, district, area, etc.) to English.
- TRANSLITERATE all proper nouns and person names phonetically — do NOT translate their meaning.
- Example: "شارع هداية" → "Hedaye Street" (NOT "Gift Street").
- Return ONLY the result. No quotes, no explanation, no commentary.

Text: "${text}"`;

  return callGemini(prompt);
}

/**
 * Translate text to English. Pure 1:1 translation.
 * Throws on failure — caller must handle (order not imported).
 */
export async function translateToEnglish(text: string): Promise<string> {
  if (!text || text.trim().length === 0) return text;

  const prompt = `Translate the following text to English. Return ONLY the translated text, nothing else. Do not interpret, summarize, or modify the meaning. Pure 1:1 translation.\n\nText: "${text}"`;

  return callGemini(prompt);
}

/**
 * Ask Gemini to match an Arabic city name against a list of known cities.
 * Returns the matched city name from the list, or null if no match.
 */
export async function matchArabicCity(
  arabicCity: string,
  candidateCities: string[]
): Promise<string | null> {
  if (!arabicCity || candidateCities.length === 0) return null;

  const prompt = `The customer wrote this city name: "${arabicCity}"
Which of these city names is the closest match? Return ONLY the matching city name from the list, nothing else.
If none match, return "NONE".

List:
${candidateCities.join("\n")}`;

  const result = await callGemini(prompt);

  if (result === "NONE" || result === "none") return null;

  // Verify the result is actually in our list (case-insensitive)
  const matched = candidateCities.find(
    (c) => c.toLowerCase() === result.toLowerCase()
  );

  return matched || null;
}

// Fields that contain person names — always transliterate, never translate
const NAME_FIELDS = new Set(["first_name", "last_name", "person_name", "company"]);

// Fields that contain addresses — translate but preserve proper nouns
const ADDRESS_FIELDS = new Set(["address_1", "address_2", "line1", "line2", "city", "state", "district"]);

/**
 * Translate multiple fields at once (batch). Returns a map of field→translated.
 * Name fields are transliterated (phonetic), address fields are translated with name preservation.
 */
export async function translateFields(
  fields: Record<string, string>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (!value || !isNonEnglish(value)) {
      results[key] = value;
      continue;
    }

    if (NAME_FIELDS.has(key)) {
      results[key] = await transliterateName(value);
    } else if (ADDRESS_FIELDS.has(key)) {
      results[key] = await translateAddress(value);
    } else {
      results[key] = await translateToEnglish(value);
    }
  }

  return results;
}
