/**
 * Client-side proforma quote PDF for the prepaid-bundle calculator — the
 * "Download quote (PDF) · share for approval" affordance. A proforma (not an
 * invoice): a clean one-pager of the sized config + price the buyer can circulate
 * for purchase approval before paying.
 *
 * Lazily pulls in {@code @cantoo/pdf-lib} (only when a quote is actually
 * downloaded) so it never weighs on the modal's first paint.
 */

export interface ProformaLine {
  label: string;
  value: string;
}

export interface ProformaDoc {
  filename: string;
  heading: string;
  subheading: string;
  /** Persisted quote number (e.g. "PB-2026-000123"); omitted when the quote wasn't persisted. */
  reference?: string;
  lines: ProformaLine[];
  /** The headline total, rendered emphasised under the lines. */
  totalLabel: string;
  totalValue: string;
  footer: string;
}

/** Build the proforma PDF and trigger a browser download. */
export async function downloadProformaPdf(doc: ProformaDoc): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("@cantoo/pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.09, 0.1, 0.13);
  const muted = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.04, 0.55, 1);
  const hair = rgb(0.85, 0.87, 0.9);
  const left = 56;
  const right = 595 - 56;
  let y = 786;

  page.drawText("Stirling", { x: left, y, size: 18, font: bold, color: ink });
  y -= 30;
  page.drawText(doc.heading, { x: left, y, size: 20, font: bold, color: ink });
  y -= 20;
  page.drawText(doc.subheading, { x: left, y, size: 11, font, color: muted });
  y -= 16;
  if (doc.reference) {
    page.drawText(`Quote ${doc.reference}`, {
      x: left,
      y,
      size: 10,
      font: bold,
      color: muted,
    });
    y -= 14;
  } else {
    y -= 4;
  }
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: hair,
  });
  y -= 28;

  for (const line of doc.lines) {
    page.drawText(line.label, { x: left, y, size: 11, font, color: muted });
    const w = bold.widthOfTextAtSize(line.value, 11);
    page.drawText(line.value, {
      x: right - w,
      y,
      size: 11,
      font: bold,
      color: ink,
    });
    y -= 22;
  }

  y -= 6;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: hair,
  });
  y -= 30;
  page.drawText(doc.totalLabel, {
    x: left,
    y,
    size: 13,
    font: bold,
    color: ink,
  });
  const tw = bold.widthOfTextAtSize(doc.totalValue, 16);
  page.drawText(doc.totalValue, {
    x: right - tw,
    y: y - 1,
    size: 16,
    font: bold,
    color: accent,
  });
  y -= 40;
  page.drawText(doc.footer, { x: left, y, size: 9.5, font, color: muted });

  const bytes = await pdf.save();
  // pdf-lib returns a Uint8Array; wrap it in a Blob and click a transient anchor.
  // (Cast: TS's Uint8Array<ArrayBufferLike> generic isn't seen as a BlobPart.)
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
