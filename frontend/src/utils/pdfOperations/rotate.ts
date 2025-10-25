import { PDFDocument, degrees } from 'pdf-lib';
import { createFileFromApiResponse } from '../fileResponseUtils';
import type { RotateParameters } from '../../hooks/tools/rotate/useRotateParameters';
import { normalizeAngle } from '../../hooks/tools/rotate/useRotateParameters';

const PDF_MIME_TYPE = 'application/pdf';

export async function rotatePdfClientSide(params: RotateParameters, files: File[]): Promise<File[]> {
  const angle = normalizeAngle(params.angle);

  if (angle === 0) {
    // No rotation requested - return copies so downstream history treats as processed files
    return Promise.all(files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      const copy = new File([buffer], file.name, {
        type: file.type || PDF_MIME_TYPE,
        lastModified: Date.now(),
      });
      return copy;
    }));
  }

  return Promise.all(files.map(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const currentRotation = page.getRotation().angle;
      const nextRotation = (currentRotation + angle) % 360;
      page.setRotation(degrees(nextRotation));
    }

    const pdfBytes = await pdfDoc.save();
    const rotatedFile = createFileFromApiResponse(pdfBytes, { 'content-type': PDF_MIME_TYPE }, file.name);
    return rotatedFile;
  }));
}
