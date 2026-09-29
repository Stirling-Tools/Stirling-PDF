import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import {
  getPdfiumModule,
  openRawDocumentSafe,
  setPageRotation,
  degreesToPdfiumRotation,
  saveRawDocument,
  closeDocAndFreeBuffer,
} from "@app/services/pdfiumService";
import {
  useToolOperation,
  defineCustomTool,
  CustomProcessorResult,
  ToolOperationHook,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import type {
  ToolApiParams,
  ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import {
  AutoRotateParameters,
  defaultParameters,
  validateAutoRotateParameters,
} from "@app/hooks/tools/autoRotate/useAutoRotateParameters";

export const AUTO_ROTATE_ENDPOINT =
  "/api/v1/misc/auto-rotate-pdf" satisfies ToolEndpoint;

type AutoRotateApiParams = ToolApiParams[typeof AUTO_ROTATE_ENDPOINT];

/**
 * Frontend params -> the endpoint's request model. Declaring these is what lets a
 * backend pipeline step carry this tool's settings: serializeToolStep sends `{}`
 * for a tool without mappers, and the pipeline composer can only offer a settings
 * panel for a tool that can map its parameters both ways.
 */
export const autoRotateToApiParams = (
  parameters: AutoRotateParameters,
): AutoRotateApiParams => ({
  detectionMode: parameters.detectionMode,
  confidenceThreshold: parameters.confidenceThreshold,
  inferUndetected: parameters.inferUndetected,
});

/** Rehydrate this tool's settings from a stored step's request body. */
export const autoRotateFromApiParams = (
  apiParams: AutoRotateApiParams,
): Partial<AutoRotateParameters> => ({
  detectionMode: apiParams.detectionMode,
  confidenceThreshold: apiParams.confidenceThreshold,
  inferUndetected: apiParams.inferUndetected,
});

export type AutoRotateMethod = "text" | "osd" | "inferred" | "none";

/** Mirrors the backend's AutoRotateAnalysisResult.PageResult. */
export interface AutoRotatePageResult {
  pageNumber: number;
  currentRotation: number;
  correction: number;
  /** Percentage of glyphs sharing a direction (text) or Tesseract OSD score (osd). */
  confidence: number | null;
  method: AutoRotateMethod;
  apply: boolean;
  note?: string | null;
}

export interface AutoRotateReport {
  pages: AutoRotatePageResult[];
  totalPages: number;
  pagesToRotate: number;
  detectedByText: number;
  detectedByOsd: number;
  inferred: number;
  undetected: number;
}

/**
 * Detection needs the server (page rendering and OCR); setting /Rotate does not.
 * So the file is uploaded once for the analysis pass and the resulting rotations
 * are applied in the browser with PDFium, as the page editor does. Uploading a
 * second time to apply would double the bandwidth, the PDFBox load and the job's
 * resource accounting for what amounts to one dictionary entry per page.
 *
 * onReport receives the report from the analysis pass; the registry (automation)
 * config passes no callback.
 */
const createAutoRotateProcessor =
  (onReport?: (report: AutoRotateReport, fileName: string) => void) =>
  async (
    parameters: AutoRotateParameters,
    files: File[],
  ): Promise<CustomProcessorResult> => {
    const outputs: File[] = [];

    for (const inputFile of files) {
      const analysisForm = new FormData();
      analysisForm.append("fileInput", inputFile);
      analysisForm.append("detectionMode", parameters.detectionMode);
      analysisForm.append(
        "confidenceThreshold",
        String(parameters.confidenceThreshold),
      );
      analysisForm.append(
        "inferUndetected",
        String(parameters.inferUndetected),
      );
      analysisForm.append("dryRun", "true");

      const analysis = await apiClient.post<AutoRotateReport>(
        AUTO_ROTATE_ENDPOINT,
        analysisForm,
      );
      const report = analysis.data;
      onReport?.(report, inputFile.name);

      // The report carries each page's existing rotation, so the absolute target
      // is known without reading the PDF. Corrections are additive, matching the
      // server's own apply path.
      const targets = report.pages
        .filter((page) => page.apply && page.correction !== 0)
        .map((page) => ({
          pageIndex: page.pageNumber - 1,
          absoluteRotation:
            (((page.currentRotation + page.correction) % 360) + 360) % 360,
        }));

      // Nothing to fix: pass the input through unchanged so the flow completes
      // and the report explains why (all upright, or nothing detected).
      if (targets.length === 0) {
        outputs.push(inputFile);
        continue;
      }

      const pdfium = await getPdfiumModule();
      const docPtr = await openRawDocumentSafe(await inputFile.arrayBuffer());
      try {
        for (const { pageIndex, absoluteRotation } of targets) {
          await setPageRotation(
            docPtr,
            pageIndex,
            degreesToPdfiumRotation(absoluteRotation),
          );
        }
        const rotatedBytes = await saveRawDocument(docPtr);
        const baseName = inputFile.name.replace(/\.pdf$/i, "");
        outputs.push(
          new File([rotatedBytes], `${baseName}_auto_rotated.pdf`, {
            type: "application/pdf",
          }),
        );
      } finally {
        closeDocAndFreeBuffer(pdfium, docPtr);
      }
    }

    return { files: outputs, consumedAllInputs: true };
  };

// Static config for the registry/automation: same processing, no report UI.
export const autoRotateOperationConfig = defineCustomTool<AutoRotateParameters>(
  {
    operationType: "autoRotate",
    endpoint: AUTO_ROTATE_ENDPOINT,
    customProcessor: createAutoRotateProcessor(),
    toApiParams: autoRotateToApiParams,
    fromApiParams: autoRotateFromApiParams,
    defaultParameters,
    validateParams: validateAutoRotateParameters,
  },
);

export interface AutoRotateOperationHook extends ToolOperationHook<AutoRotateParameters> {
  /** Per-file detection reports from the last run, keyed in run order. */
  reports: { fileName: string; report: AutoRotateReport }[];
}

export const useAutoRotateOperation = (): AutoRotateOperationHook => {
  const { t } = useTranslation();
  const [reports, setReports] = useState<
    { fileName: string; report: AutoRotateReport }[]
  >([]);

  const onReport = useCallback((report: AutoRotateReport, fileName: string) => {
    setReports((previous) => [...previous, { fileName, report }]);
  }, []);

  const operation = useToolOperation<AutoRotateParameters>({
    ...autoRotateOperationConfig,
    customProcessor: useCallback(
      async (parameters: AutoRotateParameters, files: File[]) => {
        setReports([]);
        return createAutoRotateProcessor(onReport)(parameters, files);
      },
      [onReport],
    ),
    getErrorMessage: createStandardErrorHandler(
      t(
        "autoRotate.error.failed",
        "An error occurred while auto-rotating the PDF.",
      ),
    ),
  });

  return { ...operation, reports };
};
