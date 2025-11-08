import { PDFDocument } from 'pdf-lib';
import type { CropParameters } from '@app/hooks/tools/crop/useCropParameters';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

export async function cropPdfClientSide(
  params: CropParameters,
  files: File[]
): Promise<File[]> {
  const { cropArea } = params;

  return Promise.all(files.map(async (file) => {
    const sourceBytes = await file.arrayBuffer();
    const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    const outputDoc = await PDFDocument.create();

    const left = cropArea.x;
    const bottom = cropArea.y;
    const right = cropArea.x + cropArea.width;
    const top = cropArea.y + cropArea.height;

    for (let index = 0; index < sourceDoc.getPageCount(); index += 1) {
      const page = sourceDoc.getPage(index);
      const embedded = await outputDoc.embedPage(page, {
        left,
        bottom,
        right,
        top,
      });

      const newPage = outputDoc.addPage([cropArea.width, cropArea.height]);
      newPage.drawPage(embedded, {
        x: 0,
        y: 0,
        width: cropArea.width,
        height: cropArea.height,
      });
    }

    const croppedBytes = await outputDoc.save();
    return createFileFromApiResponse(croppedBytes, { 'content-type': PDF_MIME_TYPE }, file.name);
  }));
}
