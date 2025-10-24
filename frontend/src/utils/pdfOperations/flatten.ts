import { PDFDocument } from 'pdf-lib';
import type { FlattenParameters } from '../../hooks/tools/flatten/useFlattenParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

export async function flattenPdfClientSide(
  params: FlattenParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const sourceBytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });

      const form = pdfDoc.getForm();
      if (form) {
        try {
          form.updateFieldAppearances();
        } catch {
          // ignore appearance update errors - flatten will continue regardless
        }
        form.flatten();
      }

      const pdfBytes = await pdfDoc.save();
      return createFileFromApiResponse(pdfBytes, { 'content-type': PDF_MIME_TYPE }, file.name);
    })
  );
}
