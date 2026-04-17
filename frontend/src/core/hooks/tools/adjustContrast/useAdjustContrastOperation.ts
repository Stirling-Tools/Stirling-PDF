import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  AdjustContrastParameters,
  defaultParameters,
} from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";
import { applyAdjustmentsToCanvas } from "@app/components/tools/adjustContrast/utils";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { createFileFromApiResponse } from "@app/utils/fileResponseUtils";
import { getPdfiumModule, saveRawDocument } from "@app/services/pdfiumService";
import { copyRgbaToBgraHeap } from "@app/utils/pdfiumBitmapUtils";

async function renderPdfPageToCanvas(
  pdf: any,
  pageNumber: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// Render, adjust, and assemble all pages of a single PDF into a new PDF using PDFium
async function buildAdjustedPdfForFile(
  file: File,
  params: AdjustContrastParameters,
): Promise<File> {
  const m = await getPdfiumModule();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(arrayBuffer, {});
  const pageCount = pdf.numPages;

  const docPtr = m.FPDF_CreateNewDocument();
  if (!docPtr) throw new Error("PDFium: failed to create document");

  try {
    for (let p = 1; p <= pageCount; p++) {
      const srcCanvas = await renderPdfPageToCanvas(pdf, p, 2);
      const adjusted = applyAdjustmentsToCanvas(srcCanvas, params);
      const ctx = adjusted.getContext("2d");
      if (!ctx) {
        console.warn(
          `[adjustContrast] Skipping page ${p}: failed to get canvas context`,
        );
        continue;
      }

      const imageData = ctx.getImageData(0, 0, adjusted.width, adjusted.height);
      const imgWidth = imageData.width;
      const imgHeight = imageData.height;

      // Since we render at scale 2, the actual PDF page size is half
      const pdfPageWidth = imgWidth / 2;
      const pdfPageHeight = imgHeight / 2;

      const pagePtr = m.FPDFPage_New(
        docPtr,
        p - 1,
        pdfPageWidth,
        pdfPageHeight,
      );
      if (!pagePtr) {
        console.warn(
          `[adjustContrast] Skipping page ${p}: failed to create PDFium page`,
        );
        continue;
      }

      let bitmapPtr = 0;
      try {
        bitmapPtr = m.FPDFBitmap_Create(imgWidth, imgHeight, 1);
        if (!bitmapPtr) {
          console.warn(
            `[adjustContrast] Skipping page ${p}: failed to create bitmap`,
          );
          continue;
        }

        const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
        const stride = m.FPDFBitmap_GetStride(bitmapPtr);
        copyRgbaToBgraHeap(
          m,
          new Uint8Array(imageData.data.buffer),
          bufferPtr,
          imgWidth,
          imgHeight,
          stride,
        );

        const imageObjPtr = m.FPDFPageObj_NewImageObj(docPtr);
        if (imageObjPtr) {
          const setBitmapOk = m.FPDFImageObj_SetBitmap(
            pagePtr,
            0,
            imageObjPtr,
            bitmapPtr,
          );
          if (setBitmapOk) {
            const matrixPtr = m.pdfium.wasmExports.malloc(6 * 4);
            try {
              m.pdfium.setValue(matrixPtr, pdfPageWidth, "float");
              m.pdfium.setValue(matrixPtr + 4, 0, "float");
              m.pdfium.setValue(matrixPtr + 8, 0, "float");
              m.pdfium.setValue(matrixPtr + 12, pdfPageHeight, "float");
              m.pdfium.setValue(matrixPtr + 16, 0, "float");
              m.pdfium.setValue(matrixPtr + 20, 0, "float");

              if (m.FPDFPageObj_SetMatrix(imageObjPtr, matrixPtr)) {
                m.FPDFPage_InsertObject(pagePtr, imageObjPtr);
              } else {
                m.FPDFPageObj_Destroy(imageObjPtr);
              }
            } finally {
              m.pdfium.wasmExports.free(matrixPtr);
            }
          } else {
            m.FPDFPageObj_Destroy(imageObjPtr);
          }
        }
      } finally {
        if (bitmapPtr) m.FPDFBitmap_Destroy(bitmapPtr);
        m.FPDFPage_GenerateContent(pagePtr);
        m.FPDF_ClosePage(pagePtr);
      }
    }

    const pdfBytes = await saveRawDocument(docPtr);
    const out = createFileFromApiResponse(
      pdfBytes,
      { "content-type": "application/pdf" },
      file.name,
    );
    pdfWorkerManager.destroyDocument(pdf);
    return out;
  } finally {
    m.FPDF_CloseDocument(docPtr);
  }
}

async function processPdfClientSide(
  params: AdjustContrastParameters,
  files: File[],
): Promise<CustomProcessorResult> {
  let CONCURRENCY_LIMIT = 2;
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number"
  ) {
    if (navigator.hardwareConcurrency >= 8) CONCURRENCY_LIMIT = 4;
    else if (navigator.hardwareConcurrency >= 4) CONCURRENCY_LIMIT = 3;
  }
  CONCURRENCY_LIMIT = Math.min(CONCURRENCY_LIMIT, files.length);

  const mapWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> => {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = new Array(Math.min(limit, items.length))
      .fill(0)
      .map(async () => {
        let current = nextIndex++;
        while (current < items.length) {
          results[current] = await worker(items[current], current);
          current = nextIndex++;
        }
      });

    await Promise.all(workers);
    return results;
  };

  const processedFiles = await mapWithConcurrency(
    files,
    CONCURRENCY_LIMIT,
    (file) => buildAdjustedPdfForFile(file, params),
  );

  return {
    files: processedFiles,
    consumedAllInputs: false,
  };
}

export const adjustContrastOperationConfig = {
  toolType: ToolType.custom,
  customProcessor: processPdfClientSide,
  operationType: "adjustContrast",
  defaultParameters,
  settingsComponentPath:
    "components/tools/adjustContrast/AdjustContrastSingleStepSettings",
} as const;

export const useAdjustContrastOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<AdjustContrastParameters>({
    ...adjustContrastOperationConfig,
    getErrorMessage: () =>
      t("adjustContrast.error.failed", "Failed to adjust colors/contrast"),
  });
};
