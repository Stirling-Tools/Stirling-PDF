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
  AutoFormDetectionParameters,
  defaultParameters,
} from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

const DETECT_ENDPOINT = "/api/v1/ai/form-detection/detect";
const STATUS_URL = "/api/v1/ai/form-detection-model/status";

// Static function shared by the hook and the automation executor.
export const buildAutoFormDetectionFormData = (
  parameters: AutoFormDetectionParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("file", file);
  // Server path detects and applies the AcroForm in one call, returning the fillable PDF.
  formData.append("applyToPdf", "true");
  if (typeof parameters.confidence === "number") {
    formData.append("confThreshold", String(parameters.confidence));
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
  const res = await apiClient.post(
    DETECT_ENDPOINT,
    buildAutoFormDetectionFormData(parameters, file),
    { responseType: "blob" },
  );
  return new File([res.data as Blob], outputName(file), {
    type: "application/pdf",
  });
}

async function browserDetect(
  parameters: AutoFormDetectionParameters,
  file: File,
  entry: FormDetectionCatalogEntry,
): Promise<File> {
  // Lazy-load the in-browser engine (onnxruntime-web + the ~12MB wasm) only when browser-mode
  // detection actually runs - it is never pulled into the initial bundle or loaded on the homepage.
  const { runBrowserDetection } =
    await import("@app/services/formDetection/runBrowserPipeline");
  const bytes = await file.arrayBuffer();
  const { appliedPdf } = await runBrowserDetection(
    bytes,
    entry,
    parameters.confidence,
  );
  return new File([new Uint8Array(appliedPdf)], outputName(file), {
    type: "application/pdf",
  });
}

/**
 * Runs detection where the admin configured it to run: 'server' (upload), 'browser' (in-browser
 * WASM only - the PDF never leaves the device, no fallback), or 'auto' (browser first, falling back
 * to the server on any browser-path error).
 */
async function processAutoFormDetection(
  parameters: AutoFormDetectionParameters,
  files: File[],
): Promise<{ files: File[] }> {
  const file = files[0];

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
    // Strict: never fall back to the server, so the PDF truly stays on the device.
    return { files: [await browserDetect(parameters, file, activeEntry)] };
  }
  // auto: prefer the browser, fall back to the server if it fails.
  try {
    return { files: [await browserDetect(parameters, file, activeEntry)] };
  } catch (e) {
    console.warn(
      "[AutoFormDetection] in-browser engine failed; falling back to server",
      e,
    );
    return { files: [await serverDetect(parameters, file)] };
  }
}

export const autoFormDetectionOperationConfig = {
  toolType: ToolType.custom,
  customProcessor: processAutoFormDetection,
  operationType: "autoFormDetection",
  // Used only for cloud/credit routing of the server path; execution is the custom processor.
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
