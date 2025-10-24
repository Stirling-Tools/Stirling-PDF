import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pageLayoutClientSide } from './pageLayout';
import type { PageLayoutParameters } from '../../hooks/tools/pageLayout/usePageLayoutParameters';

async function createPdf(pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([200, 200]);
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], 'layout.pdf', { type: 'application/pdf' });
}

describe('pageLayoutClientSide', () => {
  it('creates an A4 page with multiple pages per sheet', async () => {
    const file = await createPdf(2);
    const params = {
      pagesPerSheet: 2,
      addBorder: true,
      processingMode: 'frontend'
    } as PageLayoutParameters;

    const [result] = await pageLayoutClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const page = doc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.28, 2);
    expect(page.getHeight()).toBeCloseTo(841.89, 2);
  });
});
