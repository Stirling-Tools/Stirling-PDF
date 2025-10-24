import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { splitPdfClientSide } from './split';
import type { SplitParameters } from '../../hooks/tools/split/useSplitParameters';
import { SPLIT_METHODS } from '../../constants/splitConstants';

async function createPdf(pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([200, 200]);
    page.moveTo(50, 150);
    page.drawText(`Page ${i + 1}`);
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], 'split.pdf', { type: 'application/pdf' });
}

describe('splitPdfClientSide', () => {
  it('splits pages into separate files based on page list', async () => {
    const file = await createPdf(4);
    const params = {
      method: SPLIT_METHODS.BY_PAGES,
      pages: '1,2,4',
      processingMode: 'frontend'
    } as SplitParameters;

    const outputs = await splitPdfClientSide(params, [file]);
    expect(outputs).toHaveLength(3);

    const first = await PDFDocument.load(await outputs[0].arrayBuffer());
    expect(first.getPageCount()).toBe(1);
    const last = await PDFDocument.load(await outputs[2].arrayBuffer());
    expect(last.getPageCount()).toBe(1);
  });

  it('splits by page count (every N pages)', async () => {
    const file = await createPdf(10);
    const params = {
      method: SPLIT_METHODS.BY_PAGE_COUNT,
      splitValue: '3',
      processingMode: 'frontend'
    } as SplitParameters;

    const outputs = await splitPdfClientSide(params, [file]);
    // 10 pages split every 3 = 4 documents (3+3+3+1)
    expect(outputs).toHaveLength(4);

    const doc1 = await PDFDocument.load(await outputs[0].arrayBuffer());
    expect(doc1.getPageCount()).toBe(3);
    const doc2 = await PDFDocument.load(await outputs[1].arrayBuffer());
    expect(doc2.getPageCount()).toBe(3);
    const doc3 = await PDFDocument.load(await outputs[2].arrayBuffer());
    expect(doc3.getPageCount()).toBe(3);
    const doc4 = await PDFDocument.load(await outputs[3].arrayBuffer());
    expect(doc4.getPageCount()).toBe(1);
  });

  it('splits by document count (into N equal parts)', async () => {
    const file = await createPdf(10);
    const params = {
      method: SPLIT_METHODS.BY_DOC_COUNT,
      splitValue: '3',
      processingMode: 'frontend'
    } as SplitParameters;

    const outputs = await splitPdfClientSide(params, [file]);
    // 10 pages split into 3 docs = 4+4+2 pages (or 4+3+3)
    expect(outputs).toHaveLength(3);

    const totalPages = outputs.reduce(async (sum, output) => {
      const doc = await PDFDocument.load(await output.arrayBuffer());
      return (await sum) + doc.getPageCount();
    }, Promise.resolve(0));

    expect(await totalPages).toBe(10);
  });

  it('splits by size (file size threshold)', async () => {
    const file = await createPdf(10);
    // Create a small size threshold that will force multiple splits
    // Approximate size: a minimal PDF is ~1-2KB per page, so 5KB should split
    const params = {
      method: SPLIT_METHODS.BY_SIZE,
      splitValue: '5000', // 5KB
      processingMode: 'frontend'
    } as SplitParameters;

    const outputs = await splitPdfClientSide(params, [file]);

    // Should have multiple output files
    expect(outputs.length).toBeGreaterThan(1);

    // Verify each output is under or near the threshold (with some tolerance for PDF structure)
    for (const output of outputs) {
      const size = output.size;
      // Allow some overhead for PDF structure, but it shouldn't be massively over
      expect(size).toBeLessThan(10000); // 10KB max with overhead
    }

    // Verify total page count is preserved
    const totalPages = await outputs.reduce(async (sum, output) => {
      const doc = await PDFDocument.load(await output.arrayBuffer());
      return (await sum) + doc.getPageCount();
    }, Promise.resolve(0));

    expect(totalPages).toBe(10);
  });
});
