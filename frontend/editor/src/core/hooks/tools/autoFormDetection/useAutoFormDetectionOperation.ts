import { useTranslation } from "react-i18next";

import {
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import apiClient from "@app/services/apiClient";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  emitStage,
  emitSummary,
  parseSummary,
} from "@app/services/formDetection/progress";
import {
  AutoFormDetectionParameters,
  defaultParameters,
  resolveConfidence,
} from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

const DETECT_ENDPOINT = "/api/v1/form/form-detection/detect";

export const buildAutoFormDetectionFormData = (
  parameters: AutoFormDetectionParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("file", file);
  // The server writes the AcroForm with PDFBox and reports what it added in a header, so one
  // request covers both the fillable PDF and the counts the results panel shows.
  formData.append("applyToPdf", "true");
  const confidence = resolveConfidence(parameters);
  if (typeof confidence === "number") {
    formData.append("confThreshold", String(confidence));
  }
  return formData;
};

function asPdf(data: Blob, source: File): File {
  const base = (source.name || "document").replace(/\.pdf$/i, "");
  return new File([data], `${base}_form.pdf`, { type: "application/pdf" });
}

async function processAutoFormDetection(
  parameters: AutoFormDetectionParameters,
  files: File[],
): Promise<{ files: File[] }> {
  const file = files[0];

  try {
    emitStage({ kind: "detecting" });
    const res = await apiClient.post(
      DETECT_ENDPOINT,
      buildAutoFormDetectionFormData(parameters, file),
      { responseType: "blob" },
    );

    const summary = parseSummary(res.headers?.["x-stirling-detected-fields"]);
    if (summary) {
      emitSummary(summary);
    } else {
      // Not fatal - the PDF is still correct - but the results panel needs the header, so a
      // proxy that drops it turns into a silently missing summary without this.
      console.warn(
        "[AutoFormDetection] no X-Stirling-Detected-Fields header; skipping the results summary",
      );
    }
    return { files: [asPdf(res.data as Blob, file)] };
  } finally {
    emitStage({ kind: "done" });
  }
}

export const autoFormDetectionOperationConfig = {
  toolType: ToolType.custom,
  customProcessor: processAutoFormDetection,
  operationType: "autoFormDetection",
  endpoint: DETECT_ENDPOINT,
  defaultParameters,
} as const;

export const useAutoFormDetectionOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AutoFormDetectionParameters>({
    ...autoFormDetectionOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "autoFormDetection.error.failed",
        "An error occurred while detecting form fields.",
      ),
    ),
  });
};
