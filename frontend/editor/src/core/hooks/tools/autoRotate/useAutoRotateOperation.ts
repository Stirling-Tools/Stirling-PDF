import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import {
  useToolOperation,
  defineCustomTool,
  CustomProcessorResult,
  ToolOperationHook,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  AutoRotateParameters,
  defaultParameters,
} from "@app/hooks/tools/autoRotate/useAutoRotateParameters";

export const AUTO_ROTATE_ENDPOINT = "/api/v1/misc/auto-rotate-pdf";

export type AutoRotateMethod = "text" | "osd" | "none";

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
  undetected: number;
}

/**
 * Two-phase processor: an analysis pass (dryRun) returns the per-page report the
 * tool surfaces in its results panel, then the detected corrections are applied
 * via pageRotations so detection never runs twice. onReport receives the report
 * from the analysis pass; the registry (automation) config passes no callback.
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
      analysisForm.append("dryRun", "true");

      const analysis = await apiClient.post<AutoRotateReport>(
        AUTO_ROTATE_ENDPOINT,
        analysisForm,
      );
      const report = analysis.data;
      onReport?.(report, inputFile.name);

      const corrections: Record<number, number> = {};
      for (const page of report.pages) {
        if (page.apply && page.correction !== 0) {
          corrections[page.pageNumber] = page.correction;
        }
      }

      // Nothing to fix: pass the input through unchanged so the flow completes
      // and the report explains why (all upright, or nothing detected).
      if (Object.keys(corrections).length === 0) {
        outputs.push(inputFile);
        continue;
      }

      const applyForm = new FormData();
      applyForm.append("fileInput", inputFile);
      applyForm.append("pageRotations", JSON.stringify(corrections));

      const response = await apiClient.post<Blob>(
        AUTO_ROTATE_ENDPOINT,
        applyForm,
        { responseType: "blob" },
      );
      const baseName = inputFile.name.replace(/\.pdf$/i, "");
      outputs.push(
        new File([response.data], `${baseName}_auto_rotated.pdf`, {
          type: response.data.type || "application/pdf",
        }),
      );
    }

    return { files: outputs, consumedAllInputs: true };
  };

// Static config for the registry/automation: same processing, no report UI.
export const autoRotateOperationConfig = defineCustomTool<AutoRotateParameters>(
  {
    operationType: "autoRotate",
    endpoint: AUTO_ROTATE_ENDPOINT,
    customProcessor: createAutoRotateProcessor(),
    defaultParameters,
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
