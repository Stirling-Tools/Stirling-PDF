import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { flattenPdfClientSide } from './flatten';
import type { FlattenParameters } from '../../hooks/tools/flatten/useFlattenParameters';

async function createFormPdf(): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([200, 200]);
  const form = pdfDoc.getForm();
  const textField = form.createTextField('name');
  textField.setText('Stirling');
  textField.addToPage(page, { x: 20, y: 120, width: 160, height: 24 });
  const bytes = await pdfDoc.save();
  return new File([bytes as BlobPart], 'form.pdf', { type: 'application/pdf' });
}

describe('flattenPdfClientSide', () => {
  it('flattens interactive form fields', async () => {
    const file = await createFormPdf();
    const params = { flattenOnlyForms: true, processingMode: 'frontend' } as FlattenParameters;

    const [flattened] = await flattenPdfClientSide(params, [file]);
    const doc = await PDFDocument.load(await flattened.arrayBuffer());
    const form = doc.getForm();

    expect(form.getFields().length).toBe(0);
  });
});
