/**
 * Commercial Invoice PDF generator (client-side only).
 * Uses jsPDF + jspdf-autotable for layout.
 * Dynamic import recommended: const { generateCommercialInvoice, distributeByListPrice } = await import(...)
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Shipper (fixed company info) ────────────────────────────────────
const SHIPPER = {
  company: "Bazaarica Kozmetik Ic ve Dis Tic Ltd Sti",
  address: "PARSELLER MAH. YURTSEVER CAD. SINPAS ISTANBUL PALACE SITESI NO: 4 O IC KAPI NO: 1",
  city: "UMRANIYE / ISTANBUL",
  country: "Turkiye",
  taxNo: "1601768002",
  phone: "+90 555 099 65 62",
};

// ── Types ───────────────────────────────────────────────────────────
export interface InvoiceLineItem {
  description: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
  hsCode?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  awbNumber: string;
  consigneeName: string;
  consigneeCompany?: string;
  consigneeAddress: string;
  consigneeCity: string;
  consigneeCountry: string;
  consigneePhone?: string;
  items: InvoiceLineItem[];
  totalValue: number;
  currency: string;
  numberOfPieces: number;
  totalWeight: number;
}

// ── Price Distribution ──────────────────────────────────────────────
/**
 * Distribute declared value proportionally across items by their WC list prices.
 * Each item's invoice value = declaredValue × (listPrice × qty) / totalListValue.
 * Last item gets remainder to avoid rounding drift.
 */
export function distributeByListPrice(
  items: { description: string; sku: string; quantity: number; listPrice: number; hsCode?: string }[],
  declaredValue: number,
): InvoiceLineItem[] {
  const totalListValue = items.reduce((sum, it) => sum + it.listPrice * it.quantity, 0);

  // Fallback: equal distribution if no list prices
  if (totalListValue === 0) {
    const perItem = declaredValue / (items.length || 1);
    return items.map((it) => ({
      description: it.description,
      sku: it.sku,
      quantity: it.quantity,
      unitPrice: round2(perItem / (it.quantity || 1)),
      total: round2(perItem),
      hsCode: it.hsCode,
    }));
  }

  let distributed = 0;
  return items.map((it, idx) => {
    let total: number;
    if (idx === items.length - 1) {
      total = round2(declaredValue - distributed);
    } else {
      total = round2(declaredValue * (it.listPrice * it.quantity) / totalListValue);
      distributed += total;
    }
    return {
      description: it.description,
      sku: it.sku,
      quantity: it.quantity,
      unitPrice: round2(total / (it.quantity || 1)),
      total,
      hsCode: it.hsCode,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Logo loader (cached) ─────────────────────────────────────────────
let logoCache: string | null = null;

async function loadLogoBase64(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch("/bazaarica-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logoCache = reader.result as string;
        resolve(logoCache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── PDF Generation ──────────────────────────────────────────────────
export async function generateCommercialInvoice(data: InvoiceData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(); // ~210
  const m = 15; // margin
  let y = 15;

  // ── Header ────────────────────────────────────────────────────
  const logoData = await loadLogoBase64();
  if (logoData) {
    // Logo aspect ratio ~5:1 — display at 45mm × 9mm
    doc.addImage(logoData, "PNG", m, y - 7, 45, 9);
  } else {
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("BAZAARICA", m, y);
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("COMMERCIAL INVOICE", pw - m, y, { align: "right" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Kozmetik Ic ve Dis Tic Ltd Sti", m, y + 5);

  y += 9;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
  y += 8;

  // ── Shipper (left) + Invoice details (right) ──────────────────
  const colR = pw / 2 + 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Shipper / Exporter:", m, y);
  doc.text("Invoice Details:", colR, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  doc.text(SHIPPER.company, m, y);
  doc.text(`Invoice No: ${data.invoiceNumber}`, colR, y);
  y += 4;

  const addrLines = doc.splitTextToSize(SHIPPER.address, colR - m - 15);
  doc.text(addrLines, m, y);
  doc.text(`Date: ${data.invoiceDate}`, colR, y);
  y += 4;

  doc.text(`AWB: ${data.awbNumber}`, colR, y);
  if (addrLines.length > 1) y += 4 * (addrLines.length - 1);
  y += 4;

  doc.text(`${SHIPPER.city}, ${SHIPPER.country}`, m, y);
  y += 4;
  doc.text(`Tax No: ${SHIPPER.taxNo}`, m, y);
  y += 4;
  doc.text(`Tel: ${SHIPPER.phone}`, m, y);
  y += 8;

  // ── Consignee ─────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Consignee / Importer:", m, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(data.consigneeName, m, y);
  y += 4;
  if (data.consigneeCompany) {
    doc.text(data.consigneeCompany, m, y);
    y += 4;
  }
  if (data.consigneeAddress) {
    const cLines = doc.splitTextToSize(data.consigneeAddress, pw - 2 * m);
    doc.text(cLines, m, y);
    y += 4 * cLines.length;
  }
  doc.text(`${data.consigneeCity}, ${data.consigneeCountry}`, m, y);
  y += 4;
  if (data.consigneePhone) {
    doc.text(`Tel: ${data.consigneePhone}`, m, y);
    y += 4;
  }
  y += 6;

  // ── Items Table ───────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [[
      "#",
      "Description of Goods",
      "SKU",
      "Qty",
      `Unit Price (${data.currency})`,
      `Total (${data.currency})`,
      "HS Code",
    ]],
    body: data.items.map((item, idx) => [
      idx + 1,
      item.description,
      item.sku || "-",
      item.quantity,
      item.unitPrice.toFixed(2),
      item.total.toFixed(2),
      item.hsCode || "-",
    ]),
    foot: [[
      "", "", "", "",
      "TOTAL:",
      data.totalValue.toFixed(2),
      "",
    ]],
    theme: "grid",
    headStyles: {
      fillColor: [41, 41, 41],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 8 },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontSize: 9,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 52 },
      2: { cellWidth: 22 },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
      6: { cellWidth: 22, halign: "center" },
    },
    margin: { left: m, right: m },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Summary ───────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  doc.text(`Number of Pieces: ${data.numberOfPieces}`, m, y);
  doc.text(`Currency: ${data.currency}`, colR, y);
  y += 4;
  doc.text(`Total Weight: ${data.totalWeight} kg`, m, y);
  doc.text("Country of Origin: Turkey", colR, y);
  y += 4;
  doc.text("Terms of Delivery: DAP", m, y);
  doc.text("Purpose: Commercial", colR, y);

  y += 16;

  // ── Signature ─────────────────────────────────────────────────
  doc.setDrawColor(150);
  doc.line(m, y, m + 55, y);
  y += 4;
  doc.setFontSize(7);
  doc.text("Authorized Signature & Stamp", m, y);

  // ── Footer disclaimer ─────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(6);
  doc.setTextColor(130);
  doc.text(
    "I declare that the information on this invoice is true and correct to the best of my knowledge.",
    pw / 2,
    footerY,
    { align: "center" },
  );

  // ── Save ──────────────────────────────────────────────────────
  const fileName = `invoice_${data.awbNumber || data.invoiceNumber}.pdf`;
  doc.save(fileName);
}
