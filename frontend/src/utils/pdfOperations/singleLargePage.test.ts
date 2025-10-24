import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { singleLargePageClientSide } from './singleLargePage';
import type { SingleLargePageParameters } from '../../hooks/tools/singleLargePage/useSingleLargePageParameters';

async function createPdf(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  doc.addPage([200, 400]);
  const bytes = await doc.save();
  return new File([bytes], 'multi.pdf', { type: 'application/pdf' });
}

describe('singleLargePageClientSide', () => {
  it('stacks pages vertically into one page', async () => {
    const file = await createPdf();
    const params = { processingMode: 'frontend' } as SingleLargePageParameters;

    const [result] = await singleLargePageClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const page = doc.getPage(0);
    expect(page.getHeight()).toBeCloseTo(700);
    expect(page.getWidth()).toBeCloseTo(200);
  });
});
