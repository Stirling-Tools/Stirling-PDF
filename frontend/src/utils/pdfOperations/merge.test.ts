import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePdfClientSide } from './merge';
import type { MergeParameters } from '../../hooks/tools/merge/useMergeParameters';

async function createPdf(pages: number, contentPrefix: string): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([200, 200]);
    page.moveTo(50, 150);
    page.drawText(`${contentPrefix} Page ${i + 1}`);
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], `${contentPrefix}.pdf`, { type: 'application/pdf' });
}

describe('mergePdfClientSide', () => {
  it('merges multiple PDFs into a single file', async () => {
    const file1 = await createPdf(3, 'Doc1');
    const file2 = await createPdf(2, 'Doc2');
    const file3 = await createPdf(4, 'Doc3');

    const params: MergeParameters = {
      removeDigitalSignature: false,
      generateTableOfContents: false,
      processingMode: 'frontend'
    };

    const results = await mergePdfClientSide(params, [file1, file2, file3]);

    // Should return a single merged PDF
    expect(results).toHaveLength(1);

    // Verify the merged PDF has all pages
    const mergedDoc = await PDFDocument.load(await results[0].arrayBuffer());
    expect(mergedDoc.getPageCount()).toBe(9); // 3 + 2 + 4
  });

  it('merges PDFs in the correct order', async () => {
    const file1 = await createPdf(2, 'First');
    const file2 = await createPdf(2, 'Second');

    const params: MergeParameters = {
      removeDigitalSignature: false,
      generateTableOfContents: false,
      processingMode: 'frontend'
    };

    const results = await mergePdfClientSide(params, [file1, file2]);
    const mergedDoc = await PDFDocument.load(await results[0].arrayBuffer());

    expect(mergedDoc.getPageCount()).toBe(4);
  });

  it('handles a single PDF file', async () => {
    const file = await createPdf(5, 'Single');

    const params: MergeParameters = {
      removeDigitalSignature: false,
      generateTableOfContents: false,
      processingMode: 'frontend'
    };

    const results = await mergePdfClientSide(params, [file]);

    expect(results).toHaveLength(1);

    const doc = await PDFDocument.load(await results[0].arrayBuffer());
    expect(doc.getPageCount()).toBe(5);
  });

  it('throws error when no files provided', async () => {
    const params: MergeParameters = {
      removeDigitalSignature: false,
      generateTableOfContents: false,
      processingMode: 'frontend'
    };

    await expect(mergePdfClientSide(params, [])).rejects.toThrow('No files provided');
  });
});
