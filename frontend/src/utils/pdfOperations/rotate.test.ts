import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { rotatePdfClientSide } from './rotate';
import type { RotateParameters } from '../../hooks/tools/rotate/useRotateParameters';

async function createSamplePdf(rotation: number = 0): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  page.setRotation(degrees(rotation));
  const bytes = await pdf.save();
  return new File([bytes], 'sample.pdf', { type: 'application/pdf' });
}

describe('rotatePdfClientSide', () => {
  it('rotates pages by the requested angle', async () => {
    const input = await createSamplePdf(0);
    const params = { angle: 90, processingMode: 'frontend' } as RotateParameters;

    const [rotated] = await rotatePdfClientSide(params, [input]);
    const resultDoc = await PDFDocument.load(await rotated.arrayBuffer());
    const [page] = resultDoc.getPages();

    expect(page.getRotation().angle).toBe(90);
  });

  it('returns copies when no rotation requested', async () => {
    const input = await createSamplePdf(180);
    const params = { angle: 360, processingMode: 'frontend' } as RotateParameters;

    const [rotated] = await rotatePdfClientSide(params, [input]);
    const resultDoc = await PDFDocument.load(await rotated.arrayBuffer());
    const [page] = resultDoc.getPages();

    expect(page.getRotation().angle).toBe(180);
    expect(rotated.name).toBe(input.name);
  });
});
