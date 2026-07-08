import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  OCRParameters,
  defaultParameters,
} from "@app/hooks/tools/ocr/useOCRParameters";
import {
  useToolOperation,
  ToolOperationConfig,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";

const ENDPOINT = "/api/v1/misc/ocr-pdf" satisfies ToolEndpoint;
type OCRApiParams = ToolApiParams[typeof ENDPOINT];

// Helper: get MIME type based on file extension
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

// Lightweight ZIP extractor (keep or replace with a shared util if you have one)
async function extractZipFile(zipBlob: Blob): Promise<File[]> {
  const JSZip = await import("jszip");
  const zip = new JSZip.default();
  const zipContent = await zip.loadAsync(await zipBlob.arrayBuffer());
  const out: File[] = [];
  for (const [filename, file] of Object.entries(zipContent.files)) {
    if (!file.dir) {
      const content = await file.async("blob");
      out.push(new File([content], filename, { type: getMimeType(filename) }));
    }
  }
  return out;
}

// Helper: strip extension
function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

// Convert the tool's UI parameters into the ocr-pdf request body. The return
// type is the generated backend model, so a spec change that renames or drops a
// field breaks the build here.
export const ocrToApiParams = (parameters: OCRParameters): OCRApiParams => {
  const options = parameters.additionalOptions || [];
  return {
    languages: parameters.languages,
    ocrType: parameters.ocrType as OCRApiParams["ocrType"],
    ocrRenderType: parameters.ocrRenderType as OCRApiParams["ocrRenderType"],
    sidecar: options.includes("sidecar"),
    deskew: options.includes("deskew"),
    clean: options.includes("clean"),
    cleanFinal: options.includes("cleanFinal"),
    removeImagesAfter: options.includes("removeImagesAfter"),
  };
};

// Reconstruct the tool's UI parameters from an ocr-pdf request body, so a stored
// or AI-authored step can be re-rendered in the settings UI.
export const ocrFromApiParams = (
  apiParams: OCRApiParams,
): Partial<OCRParameters> => {
  const additionalOptions: string[] = [];
  if (apiParams.sidecar) additionalOptions.push("sidecar");
  if (apiParams.deskew) additionalOptions.push("deskew");
  if (apiParams.clean) additionalOptions.push("clean");
  if (apiParams.cleanFinal) additionalOptions.push("cleanFinal");
  if (apiParams.removeImagesAfter) additionalOptions.push("removeImagesAfter");

  return {
    languages: apiParams.languages ?? defaultParameters.languages,
    ocrType: apiParams.ocrType,
    ocrRenderType: apiParams.ocrRenderType ?? defaultParameters.ocrRenderType,
    additionalOptions,
  };
};

// Static function that can be used by both the hook and automation executor
export const buildOCRFormData = (
  parameters: OCRParameters,
  file: File,
): FormData =>
  objectToFormData(ocrToApiParams(parameters), { fileInput: file });

// Static response handler for OCR - can be used by automation executor
export const ocrResponseHandler = async (
  blob: Blob,
  originalFiles: File[],
  extractZipFiles: (blob: Blob) => Promise<File[]>,
): Promise<File[]> => {
  const headBuf = await blob.slice(0, 8).arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(headBuf));

  // ZIP: sidecar or multi-asset output
  if (head.startsWith("PK")) {
    const base = stripExt(originalFiles[0].name);
    try {
      const extractedFiles = await extractZipFiles(blob);
      if (extractedFiles.length > 0) return extractedFiles;
    } catch {
      /* ignore and try local extractor */
    }
    try {
      const local = await extractZipFile(blob); // local fallback
      if (local.length > 0) return local;
    } catch {
      /* fall through */
    }
    return [new File([blob], `ocr_${base}.zip`, { type: "application/zip" })];
  }

  // Not a PDF: surface error details if present
  if (!head.startsWith("%PDF")) {
    const textBuf = await blob.slice(0, 1024).arrayBuffer();
    const text = new TextDecoder().decode(new Uint8Array(textBuf));
    if (/error|exception|html/i.test(text)) {
      if (text.includes("OCR tools") && text.includes("not installed")) {
        throw new Error(
          "OCR tools (OCRmyPDF or Tesseract) are not installed on the server. Use the standard or fat Docker image instead of ultra-lite, or install OCR tools manually.",
        );
      }
      const title =
        text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
        text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ||
        "Unknown error";
      throw new Error(`OCR service error: ${title}`);
    }
    throw new Error(`Response is not a valid PDF. Header: "${head}"`);
  }

  const originalName = originalFiles[0].name;
  return [new File([blob], originalName, { type: "application/pdf" })];
};

// Static configuration object (without t function dependencies)
export const ocrOperationConfig = defineSingleFileTool({
  buildFormData: buildOCRFormData,
  toApiParams: ocrToApiParams,
  fromApiParams: ocrFromApiParams,
  operationType: "ocr",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useOCROperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // OCR-specific parsing: ZIP (sidecar) vs PDF vs HTML error
  const responseHandler = useCallback(
    async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
      // extractZipFiles from useToolResources already returns File[] directly
      const simpleExtractZipFiles = extractZipFiles;
      return ocrResponseHandler(blob, originalFiles, simpleExtractZipFiles);
    },
    [extractZipFiles],
  );

  const ocrConfig: ToolOperationConfig<OCRParameters> = {
    ...ocrOperationConfig,
    responseHandler,
    getErrorMessage: (error) =>
      error.message?.includes("OCR tools") &&
      error.message?.includes("not installed")
        ? "OCR tools (OCRmyPDF or Tesseract) are not installed on the server. Use the standard or fat Docker image instead of ultra-lite, or install OCR tools manually."
        : createStandardErrorHandler(
            t("ocr.error.failed", "OCR operation failed"),
          )(error),
  };

  return useToolOperation(ocrConfig);
};
