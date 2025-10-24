import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { addWatermarkClientSide } from './addWatermark';
import type { AddWatermarkParameters } from '../../hooks/tools/addWatermark/useAddWatermarkParameters';

async function createSamplePdf(): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 400]);
  page.drawText('Sample content', { x: 50, y: 350, size: 18 });
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], 'sample.pdf', { type: 'application/pdf' });
}

describe('addWatermarkClientSide', () => {
  it('returns a processed PDF with the same number of pages', async () => {
    const input = await createSamplePdf();
    const params: AddWatermarkParameters = {
      watermarkType: 'text',
      watermarkText: 'Watermark',
      fontSize: 24,
      rotation: 0,
      opacity: 50,
      widthSpacer: 40,
      heightSpacer: 40,
      alphabet: 'roman',
      customColor: '#000000',
      convertPDFToImage: false,
      processingMode: 'frontend',
    };

    const [output] = await addWatermarkClientSide(params, [input]);
    const resultDoc = await PDFDocument.load(await output.arrayBuffer());

    expect(resultDoc.getPageCount()).toBe(1);
    expect(output.type).toBe('application/pdf');
  });
});
