import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolType,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  RemoveAnnotationsParameters,
  defaultParameters,
} from "@app/hooks/tools/removeAnnotations/useRemoveAnnotationsParameters";
import {
  getPdfiumModule,
  openRawDocumentSafe,
  closeDocAndFreeBuffer,
  saveRawDocument,
} from "@app/services/pdfiumService";

// Client-side PDF processing using PDFium WASM
const removeAnnotationsProcessor = async (
  _parameters: RemoveAnnotationsParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  const processedFiles: File[] = [];

  for (const file of files) {
    try {
      const m = await getPdfiumModule();
      const fileArrayBuffer = await file.arrayBuffer();
      const docPtr = await openRawDocumentSafe(fileArrayBuffer);

      try {
        const pageCount = m.FPDF_GetPageCount(docPtr);

        for (let i = 0; i < pageCount; i++) {
          const pagePtr = m.FPDF_LoadPage(docPtr, i);
          if (!pagePtr) continue;

          // Remove all annotations from the page (iterate backward)
          const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);
          for (let j = annotCount - 1; j >= 0; j--) {
            try {
              m.FPDFPage_RemoveAnnot(pagePtr, j);
            } catch (err) {
              console.warn(
                `Failed to remove annotation ${j} on page ${i + 1}:`,
                err,
              );
            }
          }

          m.FPDF_ClosePage(pagePtr);
        }

        const outBytes = await saveRawDocument(docPtr);
        const processedFile = new File([outBytes], file.name, {
          type: "application/pdf",
        });
        processedFiles.push(processedFile);
      } finally {
        closeDocAndFreeBuffer(m, docPtr);
      }
    } catch (error) {
      console.error("Error processing file:", file.name, error);
      throw new Error(
        `Failed to process ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        {
          cause: error,
        },
      );
    }
  }

  return {
    files: processedFiles,
    consumedAllInputs: false,
  };
};

// Static configuration object
export const removeAnnotationsOperationConfig = {
  toolType: ToolType.custom,
  operationType: "removeAnnotations",
  customProcessor: removeAnnotationsProcessor,
  defaultParameters,
} as const;

export const useRemoveAnnotationsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveAnnotationsParameters>({
    ...removeAnnotationsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "removeAnnotations.error.failed",
        "An error occurred while removing annotations from the PDF.",
      ),
    ),
  });
};
