import { PAGE_SIZES } from "@editor/constants/pageSizeConstants";

export type NewPdfPageSize = "A4" | "LETTER";

const LETTER_SIZE_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO"]);

export function defaultPageSizeFor(locale: string | undefined): NewPdfPageSize {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return region && LETTER_SIZE_REGIONS.has(region) ? "LETTER" : "A4";
}

export async function createBlankPdf(size: NewPdfPageSize): Promise<File> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  const { width, height } = PAGE_SIZES[size];
  doc.addPage([width, height]);
  return new File([(await doc.save()) as BlobPart], "Untitled.pdf", {
    type: "application/pdf",
  });
}
