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
  summarizeFields,
} from "@app/services/formDetection/progress";
import { DetectedField } from "@app/services/formDetection/types";
import {
  AutoFormDetectionParameters,
  defaultParameters,
  resolveConfidence,
} from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

const DETECT_ENDPOINT = "/api/v1/form/form-detection/detect";

export const buildAutoFormDetectionFormData = (
  parameters: AutoFormDetectionParameters,
  file: File,
  applyToPdf: boolean,
): FormData => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("applyToPdf", String(applyToPdf));
  const confidence = resolveConfidence(parameters);
  if (typeof confidence === "number") {
    formData.append("confThreshold", String(confidence));
  }
  return formData;
};

function asPdf(data: BlobPart, source: File): File {
  const base = (source.name || "document").replace(/\.pdf$/i, "");
  return new File([data], `${base}_form.pdf`, { type: "application/pdf" });
}

/**
 * The one place detection is asked for. A detector running in the browser would substitute here
 * without the caller changing, since the wire contract is plain geometry.
 */
export async function detectFields(
  parameters: AutoFormDetectionParameters,
  file: File,
): Promise<DetectedField[]> {
  // Ask for the field list rather than a finished PDF so the summary panel has counts to show;
  // applying the fields here also spares the server a second parse of the same file.
  const res = await apiClient.post(
    DETECT_ENDPOINT,
    buildAutoFormDetectionFormData(parameters, file, false),
  );
  return ((res.data as { detections?: DetectedField[] })?.detections ??
    []) as DetectedField[];
}

async function processAutoFormDetection(
  parameters: AutoFormDetectionParameters,
  files: File[],
): Promise<{ files: File[] }> {
  const file = files[0];

  try {
    emitStage({ kind: "starting" });
    emitStage({ kind: "uploading" });
    const fields = await detectFields(parameters, file);

    emitStage({ kind: "applying" });
    try {
      const { applyFields } =
        await import("@app/services/formDetection/applyFields");
      const bytes = await file.arrayBuffer();
      const appliedPdf = await applyFields(bytes, fields);

      emitSummary(summarizeFields(fields));
      return { files: [asPdf(new Uint8Array(appliedPdf), file)] };
    } catch (e) {
      // Guards the local apply only: pdf-lib rejects some documents PDFBox accepts. A failed
      // detect must not land here, or every server error costs a second upload and inference.
      console.warn(
        "[AutoFormDetection] applying fields locally failed; asking the server to apply them",
        e,
      );
      const res = await apiClient.post(
        DETECT_ENDPOINT,
        buildAutoFormDetectionFormData(parameters, file, true),
        { responseType: "blob" },
      );
      return { files: [asPdf(res.data as Blob, file)] };
    }
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
