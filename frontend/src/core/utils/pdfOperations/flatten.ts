import { PDFDocument } from 'pdf-lib';
import type { FlattenParameters } from '@app/hooks/tools/flatten/useFlattenParameters';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

export async function flattenPdfClientSide(
  params: FlattenParameters,
  files: File[]
): Promise<File[]> {
  // Frontend processing only supports flattening forms (not full page rasterization)
  // The shouldUseFrontend check in the operation config ensures this is only called
  // when flattenOnlyForms is true, but we verify here for safety
  if (!params.flattenOnlyForms) {
    throw new Error('Frontend flattening only supports form flattening. Use backend for full flattening.');
  }

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
