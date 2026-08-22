import { useTranslation } from "react-i18next";

import {
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  FormDetectionModelStatus,
  FormDetectionCatalogEntry,
} from "@app/hooks/useFormDetectionModelStatus";
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

const DETECT_ENDPOINT = "/api/v1/ai/form-detection/detect";
const STATUS_URL = "/api/v1/ai/form-detection-model/status";

export const buildAutoFormDetectionFormData = (
  parameters: AutoFormDetectionParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("applyToPdf", "true");
  const confidence = resolveConfidence(parameters);
  if (typeof confidence === "number") {
    formData.append("confThreshold", String(confidence));
  }
  return formData;
};

function outputName(file: File): string {
  const base = (file.name || "document").replace(/\.pdf$/i, "");
  return `${base}_form.pdf`;
}

async function serverDetect(
  parameters: AutoFormDetectionParameters,
  file: File,
): Promise<File> {
  emitStage({ kind: "starting", engine: "server" });
  emitStage({ kind: "uploading" });
  const confidence = resolveConfidence(parameters);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("applyToPdf", "false");
  if (typeof confidence === "number") {
    formData.append("confThreshold", String(confidence));
  }

  try {
    const res = await apiClient.post(DETECT_ENDPOINT, formData);
    const fields = ((res.data as { detections?: DetectedField[] })
      ?.detections ?? []) as DetectedField[];

    emitStage({ kind: "applying" });
    const { applyFields } =
      await import("@app/services/formDetection/applyFields");
    const bytes = await file.arrayBuffer();
    const appliedPdf = await applyFields(bytes, fields);

    emitSummary(summarizeFields(fields, "server"));
    return new File([new Uint8Array(appliedPdf)], outputName(file), {
      type: "application/pdf",
    });
  } catch (e) {
    console.warn(
      "[AutoFormDetection] detect+apply flow failed; falling back to server-side apply",
      e,
    );
    const res = await apiClient.post(
      DETECT_ENDPOINT,
      buildAutoFormDetectionFormData(parameters, file),
      { responseType: "blob" },
    );
    return new File([res.data as Blob], outputName(file), {
      type: "application/pdf",
    });
  }
}

async function browserDetect(
  parameters: AutoFormDetectionParameters,
  file: File,
  entry: FormDetectionCatalogEntry,
  pageBudgetMs?: number,
): Promise<File> {
  emitStage({ kind: "starting", engine: "browser" });
  const { runBrowserDetection } =
    await import("@app/services/formDetection/runBrowserPipeline");
  const bytes = await file.arrayBuffer();
  const { fields, appliedPdf } = await runBrowserDetection(
    bytes,
    entry,
    resolveConfidence(parameters),
    emitStage,
    { pageBudgetMs },
  );
  emitSummary(summarizeFields(fields, "browser"));
  return new File([new Uint8Array(appliedPdf)], outputName(file), {
    type: "application/pdf",
  });
}

async function processAutoFormDetection(
  parameters: AutoFormDetectionParameters,
  files: File[],
): Promise<{ files: File[] }> {
  const file = files[0];

  try {
    const status = (await apiClient.get(STATUS_URL))
      .data as FormDetectionModelStatus;
    const mode = status.executionMode ?? "auto";
    const activeEntry = (status.catalog ?? []).find(
      (c) => c.id === status.activeModelId,
    );

    if (mode === "server" || !activeEntry) {
      return { files: [await serverDetect(parameters, file)] };
    }
    if (mode === "browser") {
      // Strict: no budget and no fallback. The point of this mode is that the PDF never leaves the
      // device, so a slow device waits rather than silently uploading.
      return { files: [await browserDetect(parameters, file, activeEntry)] };
    }

    // auto: prefer the device. Keeping detection local spares the backend from running every page
    // of every user's document, and keeps the file on the machine it came from. Only a device that
    // looks too weak to finish in reasonable time starts on the server instead.
    const {
      isUnderpoweredForBrowserEngine,
      describeDevice,
      BROWSER_PAGE_BUDGET_MS,
    } = await import("@app/services/formDetection/deviceCapability");
    if (isUnderpoweredForBrowserEngine()) {
      console.debug(
        `[AutoFormDetection] ${describeDevice()} - using the server engine`,
      );
      return { files: [await serverDetect(parameters, file)] };
    }
    try {
      return {
        files: [
          await browserDetect(
            parameters,
            file,
            activeEntry,
            BROWSER_PAGE_BUDGET_MS,
          ),
        ],
      };
    } catch (e) {
      // Covers both a hard failure and the budget check: the capability hints are advisory, so the
      // first page is the real measurement and the honest place to change our mind.
      console.warn(
        "[AutoFormDetection] in-browser engine did not complete; falling back to server",
        e,
      );
      return { files: [await serverDetect(parameters, file)] };
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
