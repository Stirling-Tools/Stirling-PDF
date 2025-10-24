import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { adjustPageScaleClientSide } from './adjustPageScale';
import type { AdjustPageScaleParameters } from '../../hooks/tools/adjustPageScale/useAdjustPageScaleParameters';
import { PageSize } from '../../hooks/tools/adjustPageScale/useAdjustPageScaleParameters';

async function createPdf(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  const bytes = await doc.save();
  return new File([bytes], 'scale.pdf', { type: 'application/pdf' });
}

describe('adjustPageScaleClientSide', () => {
  it('scales a page to the requested size', async () => {
    const file = await createPdf();
    const params = {
      scaleFactor: 1,
      pageSize: PageSize.A4,
      processingMode: 'frontend'
    } as AdjustPageScaleParameters;

    const [result] = await adjustPageScaleClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const page = doc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.28, 2);
    expect(page.getHeight()).toBeCloseTo(841.89, 2);
  });
});
