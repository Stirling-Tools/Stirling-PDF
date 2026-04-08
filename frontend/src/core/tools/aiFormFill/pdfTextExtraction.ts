/**
 * Shared PDF text extraction utility.
 * Extracts text content per page from a PDF file using PDF.js.
 */
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';

export async function extractPageTexts(file: File | Blob): Promise<Record<number, string>> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer);
  const pageTexts: Record<number, string> = {};
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      pageTexts[i - 1] = textContent.items
        .map((item: any) => item.str)
        .join(' ');
    }
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
  return pageTexts;
}

/** Extract all text from a PDF as a single string. */
export async function extractFullText(file: File | Blob): Promise<string> {
  const pageTexts = await extractPageTexts(file);
  return Object.values(pageTexts).join('\n');
}
