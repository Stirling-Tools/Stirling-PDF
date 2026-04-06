/**
 * PDF Text Extraction Service for AI Agent Chat.
 *
 * Extracts all text from one or more PDF files using PDF.js,
 * returning a combined string suitable for sending to AI agents.
 */

import { pdfWorkerManager } from '@app/services/pdfWorkerManager';

interface TextItem {
  str: string;
  transform: number[];
}

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as TextItem).str === 'string'
  );
}

/**
 * Extract all text from a single PDF file.
 * Returns the text as a single string with page markers.
 */
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfWorkerManager.createDocument(arrayBuffer);

  try {
    const pages: string[] = [];
    const numPages = doc.numPages;

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      const lines: { y: number; text: string }[] = [];
      let currentY: number | null = null;
      let currentLine = '';

      for (const item of textContent.items) {
        if (!isTextItem(item)) continue;
        const y = Math.round(item.transform[5]);

        if (currentY === null || Math.abs(y - currentY) > 3) {
          if (currentLine.trim()) {
            lines.push({ y: currentY ?? y, text: currentLine.trim() });
          }
          currentLine = item.str;
          currentY = y;
        } else {
          currentLine += item.str;
        }
      }
      if (currentLine.trim()) {
        lines.push({ y: currentY ?? 0, text: currentLine.trim() });
      }

      // Sort by Y position (top to bottom: higher Y = higher on page in PDF coords)
      lines.sort((a, b) => b.y - a.y);

      const pageText = lines.map((l) => l.text).join('\n');
      if (pageText.trim()) {
        pages.push(`--- Page ${i} ---\n${pageText}`);
      }
    }

    return pages.join('\n\n');
  } finally {
    pdfWorkerManager.destroyDocument(doc);
  }
}

/**
 * Extract text from multiple files. Non-PDF files are skipped.
 * Returns a combined string with file headers.
 */
export async function extractTextFromFiles(files: File[]): Promise<string> {
  const pdfFiles = files.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || !f.type
  );
  console.log('[TextExtraction] Files:', files.length, 'PDFs:', pdfFiles.length, pdfFiles.map(f => `${f.name}(${f.size}b,type=${f.type})`));

  if (pdfFiles.length === 0) return '';

  const results: string[] = [];

  for (const file of pdfFiles) {
    try {
      const text = await extractTextFromPdf(file);
      if (text.trim()) {
        if (pdfFiles.length > 1) {
          results.push(`=== ${file.name} ===\n${text}`);
        } else {
          results.push(text);
        }
      }
    } catch (err) {
      console.warn(`[TextExtraction] Failed to extract text from ${file.name}:`, err);
    }
  }

  return results.join('\n\n');
}
