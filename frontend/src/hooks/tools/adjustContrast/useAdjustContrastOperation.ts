import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { AdjustContrastParameters, defaultParameters } from './useAdjustContrastParameters';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { applyAdjustmentsToCanvas } from '../../../components/tools/adjustContrast/utils';
import { createFileFromApiResponse } from '../../../utils/fileResponseUtils';

async function renderPdfPageToCanvas(pdf: any, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// adjustment logic moved to shared util

async function processPdfClientSide(params: AdjustContrastParameters, files: File[]): Promise<File[]> {
  const outputs: File[] = [];
  const { pdfWorkerManager } = await import('../../../services/pdfWorkerManager');

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {});
    const pageCount = pdf.numPages;

    const newDoc = await PDFLibDocument.create();

    for (let p = 1; p <= pageCount; p++) {
      const srcCanvas = await renderPdfPageToCanvas(pdf, p, 2);
      const adjusted = applyAdjustmentsToCanvas(srcCanvas, params);
      const pngUrl = adjusted.toDataURL('image/png');
      const res = await fetch(pngUrl);
      const pngBytes = new Uint8Array(await res.arrayBuffer());
      const embedded = await newDoc.embedPng(pngBytes);
      const { width, height } = embedded.scale(1);
      const page = newDoc.addPage([width, height]);
      page.drawImage(embedded, { x: 0, y: 0, width, height });
    }

    const pdfBytes = await newDoc.save();
    const out = createFileFromApiResponse(pdfBytes, { 'content-type': 'application/pdf' }, file.name);
    outputs.push(out);
    pdfWorkerManager.destroyDocument(pdf);
  }

  return outputs;
}

export const adjustContrastOperationConfig = {
  toolType: ToolType.custom,
  customProcessor: processPdfClientSide,
  operationType: 'adjustContrast',
  defaultParameters,
} as const;

export const useAdjustContrastOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<AdjustContrastParameters>({
    ...adjustContrastOperationConfig,
    getErrorMessage: () => t('adjustContrast.error.failed', 'Failed to adjust colors/contrast')
  });
};


