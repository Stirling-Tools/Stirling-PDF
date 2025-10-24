import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { changeMetadataClientSide } from './changeMetadata';
import type { ChangeMetadataParameters } from '../../hooks/tools/changeMetadata/useChangeMetadataParameters';

async function createEmptyPdf(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  const bytes = await pdf.save();
  return new File([bytes], 'sample.pdf', { type: 'application/pdf' });
}

describe('changeMetadataClientSide', () => {
  it('applies standard metadata fields', async () => {
    const file = await createEmptyPdf();
    const params = {
      title: 'Browser Title',
      author: 'Frontend Author',
      subject: 'Metadata Test',
      keywords: 'stirling,pdf',
      creator: 'Browser',
      producer: 'Browser',
      creationDate: new Date(Date.UTC(2024, 0, 1, 12, 0, 0)),
      modificationDate: new Date(Date.UTC(2024, 0, 2, 12, 0, 0)),
      trapped: 'True',
      customMetadata: [{ id: '1', key: 'CustomKey', value: 'CustomValue' }],
      deleteAll: false,
      processingMode: 'frontend'
    } as ChangeMetadataParameters;

    const [result] = await changeMetadataClientSide(params, [file]);
    const doc = await PDFDocument.load(await result.arrayBuffer());
    const info = (doc.context.lookup(doc.context.trailer.get(PDFName.of('Info')), PDFDict) as PDFDict);

    expect(info.get(PDFName.of('Title'))?.value).toContain('Browser Title');
    expect(info.get(PDFName.of('Author'))?.value).toContain('Frontend Author');
    expect(info.get(PDFName.of('CustomKey'))?.value).toContain('CustomValue');
  });
});
