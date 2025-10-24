import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { addStampClientSide } from './addStamp';
import type { AddStampParameters } from '../../components/tools/addStamp/useAddStampParameters';

async function createPdf(): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 300]);
  page.drawText('Page 1', { x: 20, y: 260, size: 18 });
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], 'stamp.pdf', { type: 'application/pdf' });
}

describe('addStampClientSide', () => {
  it('stamps the requested page without removing pages', async () => {
    const input = await createPdf();
    const params: AddStampParameters = {
      stampType: 'text',
      stampText: 'Approved',
      alphabet: 'roman',
      fontSize: 36,
      rotation: 0,
      opacity: 50,
      position: 5,
      overrideX: -1,
      overrideY: -1,
      customMargin: 'medium',
      customColor: '#ff0000',
      pageNumbers: '1',
      _activePill: 'fontSize',
      processingMode: 'frontend',
    };

    const [output] = await addStampClientSide(params, [input]);
    const doc = await PDFDocument.load(await output.arrayBuffer());

    expect(doc.getPageCount()).toBe(1);
    expect(output.name).toBe('stamp.pdf');
  });
});
