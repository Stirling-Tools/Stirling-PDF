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
  return new File([bytes], 'split.pdf', { type: 'application/pdf' });
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
});
