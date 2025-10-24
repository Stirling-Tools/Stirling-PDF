import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { reorganizePagesClientSide } from './reorganizePages';
import type { ReorganizePagesParameters } from '../../hooks/tools/reorganizePages/useReorganizePagesParameters';

async function createPdf(pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([200 + i * 20, 200]);
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], 'reorder.pdf', { type: 'application/pdf' });
}

describe('reorganizePagesClientSide', () => {
  it('reorders pages using a custom order', async () => {
    const file = await createPdf(3);
    const params = {
      customMode: '',
      pageNumbers: '3,1,2',
      processingMode: 'frontend'
    } as ReorganizePagesParameters;

    const [result] = await reorganizePagesClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(200 + 2 * 20);
  });

  it('supports reverse order mode', async () => {
    const file = await createPdf(2);
    const params = {
      customMode: 'REVERSE_ORDER',
      pageNumbers: '',
      processingMode: 'frontend'
    } as ReorganizePagesParameters;

    const [result] = await reorganizePagesClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(2);
  });
});
