import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import {
  createStandardErrorHandler,
  defineCustomTool,
  useToolOperation,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  AdjustColorsRustParameters,
  defaultParameters,
} from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustParameters";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
  saveRawDocument,
} from "@app/services/pdfiumService";
import { getToolsCore, type ColorAdjustments } from "@app/services/toolsCore";

export const ADJUST_COLORS_RUST_ENDPOINT = "/api/v1/misc/adjust-colors-rust";

function adjustmentsOf(params: AdjustColorsRustParameters): ColorAdjustments {
  return {
    contrast: params.contrast,
    brightness: params.brightness,
    saturation: params.saturation,
    red: params.red,
    green: params.green,
    blue: params.blue,
  };
}

function asPdf(bytes: BlobPart, source: File): File {
  return new File([bytes], source.name, { type: "application/pdf" });
}

/** Runs the Rust code as wasm against the editor's own PDFium. */
export async function adjustColorsInBrowser(
  file: File,
  adjustments: ColorAdjustments,
): Promise<File> {
  const [pdfium, tools] = await Promise.all([
    getPdfiumModule(),
    getToolsCore(),
  ]);
  const source = await openRawDocumentSafe(await file.arrayBuffer());
  const target = pdfium.FPDF_CreateNewDocument();
  try {
    if (!target) throw new Error("PDFium could not create a document");
    tools.adjustColors(source, target, adjustments);
    return asPdf(await saveRawDocument(target), file);
  } finally {
    if (target) pdfium.FPDF_CloseDocument(target);
    closeDocAndFreeBuffer(pdfium, source);
  }
}

async function adjustColorsOnServer(
  file: File,
  adjustments: ColorAdjustments,
): Promise<File> {
  const formData = new FormData();
  formData.append("fileInput", file);
  for (const [key, value] of Object.entries(adjustments)) {
    formData.append(key, String(value));
  }
  const response = await apiClient.post<Blob>(
    ADJUST_COLORS_RUST_ENDPOINT,
    formData,
    { responseType: "blob" },
  );
  return asPdf(response.data, file);
}

async function processFiles(
  params: AdjustColorsRustParameters,
  files: File[],
): Promise<CustomProcessorResult> {
  const adjust = params.processOnServer
    ? adjustColorsOnServer
    : adjustColorsInBrowser;
  const adjustments = adjustmentsOf(params);
  // One at a time: the browser path shares a single PDFium instance.
  const processed: File[] = [];
  for (const file of files) {
    processed.push(await adjust(file, adjustments));
  }
  return { files: processed };
}

export const adjustColorsRustOperationConfig =
  defineCustomTool<AdjustColorsRustParameters>({
    customProcessor: processFiles,
    operationType: "adjustColorsRust",
    endpoint: (params) =>
      params.processOnServer ? ADJUST_COLORS_RUST_ENDPOINT : undefined,
    defaultParameters,
  });

export const useAdjustColorsRustOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<AdjustColorsRustParameters>({
    ...adjustColorsRustOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("adjustColorsRust.error.failed", "Failed to adjust colors/contrast"),
    ),
  });
};
