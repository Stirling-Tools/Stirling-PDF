import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, CustomProcessorResult } from '@app/hooks/tools/shared/useToolOperation';
import { AdjustContrastParameters, defaultParameters } from '@app/hooks/tools/adjustContrast/useAdjustContrastParameters';
import { PDFDocument as PDFLibDocument } from '@cantoo/pdf-lib';
import { applyAdjustmentsToCanvas } from '@app/components/tools/adjustContrast/utils';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';

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

// Render, adjust, and assemble all pages of a single PDF into a new PDF
async function buildAdjustedPdfForFile(file: File, params: AdjustContrastParameters): Promise<File> {
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
    pdfWorkerManager.destroyDocument(pdf);
    return out;
}

async function processPdfClientSide(params: AdjustContrastParameters, files: File[]): Promise<CustomProcessorResult> {
  // Limit concurrency to avoid exhausting memory/CPU while still getting speedups
  // Heuristic: use up to 4 workers on capable machines, otherwise 2-3
  let CONCURRENCY_LIMIT = 2;
  if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
    if (navigator.hardwareConcurrency >= 8) CONCURRENCY_LIMIT = 4;
    else if (navigator.hardwareConcurrency >= 4) CONCURRENCY_LIMIT = 3;
  }
  CONCURRENCY_LIMIT = Math.min(CONCURRENCY_LIMIT, files.length);

  const mapWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> => {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      let current = nextIndex++;
      while (current < items.length) {
        results[current] = await worker(items[current], current);
        current = nextIndex++;
      }
    });

    await Promise.all(workers);
    return results;
  };

  const processedFiles = await mapWithConcurrency(files, CONCURRENCY_LIMIT, (file) => buildAdjustedPdfForFile(file, params));

  return {
    files: processedFiles,
    consumedAllInputs: false,
  };
}

export const adjustContrastOperationConfig = {
  toolType: ToolType.custom,
  customProcessor: processPdfClientSide,
  operationType: 'adjustContrast',
  defaultParameters,
  // Single-step settings component for Automate
  settingsComponentPath: 'components/tools/adjustContrast/AdjustContrastSingleStepSettings',
} as const;

export const useAdjustContrastOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<AdjustContrastParameters>({
    ...adjustContrastOperationConfig,
    getErrorMessage: () => t('adjustContrast.error.failed', 'Failed to adjust colors/contrast')
  });
};

