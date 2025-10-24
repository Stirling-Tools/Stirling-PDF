import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { removePagesClientSide } from './removePages';
import type { RemovePagesParameters } from '../../hooks/tools/removePages/useRemovePagesParameters';

async function createPdf(pages: number): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = pdf.addPage([300, 300]);
    page.drawText(`Page ${i + 1}`, { x: 20, y: 260, size: 12 });
  }
  const bytes = await pdf.save();
  return new File([bytes], 'remove.pdf', { type: 'application/pdf' });
}

describe('removePagesClientSide', () => {
  it('removes selected pages', async () => {
    const input = await createPdf(3);
    const params: RemovePagesParameters = {
      pageNumbers: '2',
      processingMode: 'frontend',
    };

    const [output] = await removePagesClientSide(params, [input]);
    const doc = await PDFDocument.load(await output.arrayBuffer());

    expect(doc.getPageCount()).toBe(2);
  });
});
