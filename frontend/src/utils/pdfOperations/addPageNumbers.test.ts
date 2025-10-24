import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { addPageNumbersClientSide } from './addPageNumbers';
import type { AddPageNumbersParameters } from '../../components/tools/addPageNumbers/useAddPageNumbersParameters';

async function createPdf(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([300, 400]);
  const bytes = await doc.save();
  return new File([bytes as BlobPart], 'numbers.pdf', { type: 'application/pdf' });
}

describe('addPageNumbersClientSide', () => {
  it('adds page numbers to selected pages', async () => {
    const file = await createPdf();
    const params = {
      customMargin: 'medium',
      position: 8,
      fontSize: 12,
      fontType: 'Times',
      startingNumber: 1,
      pagesToNumber: '1',
      customText: '{n} of {total}',
      processingMode: 'frontend'
    } as AddPageNumbersParameters;

    const [result] = await addPageNumbersClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getPageCount()).toBe(2);
    // ensure document saved successfully and filename includes suffix
    expect(result.name).toContain('numbersAdded');
  });
});
