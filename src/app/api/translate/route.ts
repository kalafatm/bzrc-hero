import { NextRequest, NextResponse } from "next/server";
import { translateToEnglish, translateFields } from "@/lib/api/gemini";

/**
 * POST /api/translate — translate text or multiple fields to English
 * Body: { text: string } OR { fields: Record<string, string> }
 * Returns: { translated: string, original: string }
 *      OR: { translations: Record<string, string> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Single text translation
    if (body.text) {
      const translated = await translateToEnglish(body.text);
      return NextResponse.json({
        translated,
        original: body.text,
      });
    }

    // Batch field translation
    if (body.fields && typeof body.fields === "object") {
      const translations = await translateFields(body.fields);
      return NextResponse.json({ translations });
    }

    return NextResponse.json(
      { error: "Provide 'text' or 'fields' in the request body" },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
