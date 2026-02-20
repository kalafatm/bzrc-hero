import { NextRequest, NextResponse } from "next/server";

const SHIPPING_API_URL = process.env.SHIPPING_API_URL || "http://135.181.215.44";

/**
 * GET /api/shipments/[id]/label — proxy label PDF from remote API
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await fetch(`${SHIPPING_API_URL}/shipments/${id}/label`);

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text || `HTTP ${res.status}` },
        { status: res.status }
      );
    }

    const pdfBuffer = await res.arrayBuffer();
    const awb = res.headers.get("content-disposition")?.match(/filename="(.+?)"/)?.[1] || `label_${id}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${awb}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to download label";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
