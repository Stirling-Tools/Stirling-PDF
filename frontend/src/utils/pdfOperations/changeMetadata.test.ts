import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { changeMetadataClientSide } from './changeMetadata';
import type { ChangeMetadataParameters } from '../../hooks/tools/changeMetadata/useChangeMetadataParameters';

async function createEmptyPdf(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  const bytes = await pdf.save();
  return new File([bytes as BlobPart], 'sample.pdf', { type: 'application/pdf' });
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
    const infoRef = doc.context.trailerInfo.Info;
    const info = infoRef ? (doc.context.lookup(infoRef, PDFDict) as PDFDict) : undefined;

    expect(info).toBeDefined();
    const titleObj = info?.get(PDFName.of('Title'));
    expect((titleObj as any)?.decodeText()).toContain('Browser Title');
    const authorObj = info?.get(PDFName.of('Author'));
    expect((authorObj as any)?.decodeText()).toContain('Frontend Author');
    const customKeyObj = info?.get(PDFName.of('CustomKey'));
    expect((customKeyObj as any)?.decodeText()).toContain('CustomValue');
  });
});
