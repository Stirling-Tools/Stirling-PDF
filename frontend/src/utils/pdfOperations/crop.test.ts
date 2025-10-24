import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { cropPdfClientSide } from './crop';
import type { CropParameters } from '../../hooks/tools/crop/useCropParameters';

async function createPdf(width: number, height: number): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([width, height]);
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], 'crop.pdf', { type: 'application/pdf' });
}

describe('cropPdfClientSide', () => {
  it('crops the page to the requested dimensions', async () => {
    const input = await createPdf(400, 400);
    const params: CropParameters = {
      cropArea: { x: 50, y: 60, width: 200, height: 150 },
      processingMode: 'frontend',
    };

    const [output] = await cropPdfClientSide(params, [input]);
    const doc = await PDFDocument.load(await output.arrayBuffer());
    const [page] = doc.getPages();

    expect(page.getWidth()).toBeCloseTo(200, 3);
    expect(page.getHeight()).toBeCloseTo(150, 3);
  });
});
