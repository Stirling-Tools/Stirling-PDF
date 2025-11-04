import { pdfWorkerManager } from '@app/services/pdfWorkerManager';

export interface ExtractedPdfText {
  text: string;
  pageCount: number;
  characterCount: number;
}

export async function extractTextFromPdf(file: File): Promise<ExtractedPdfText> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer);

  try {
    let combinedText = '';
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();

      if (pageText.length > 0) {
        combinedText += `\n\n[Page ${pageIndex}]\n${pageText}`;
      }

      page.cleanup();
    }

    const text = combinedText.trim();
    return {
      text,
      pageCount: pdf.numPages,
      characterCount: text.length,
    };
  } finally {
    pdfWorkerManager.destroyDocument(pdf);
  }
}
