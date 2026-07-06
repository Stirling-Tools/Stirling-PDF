import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolType,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  RedactParameters,
  defaultParameters,
} from "@app/hooks/tools/redact/useRedactParameters";

// Automatic redaction is the only mode that calls the backend; manual redaction
// is handled client-side by EmbedPDF in the viewer.
const AUTO_ENDPOINT = "/api/v1/security/auto-redact" satisfies ToolEndpoint;
type RedactApiParams = ToolApiParams[typeof AUTO_ENDPOINT];

// Convert the tool's UI parameters into the auto-redact request body.
export const redactToApiParams = (
  parameters: RedactParameters,
): RedactApiParams => ({
  // The backend takes the search terms as a single newline-separated string.
  listOfText: parameters.wordsToRedact.join("\n"),
  useRegex: parameters.useRegex,
  wholeWordSearch: parameters.wholeWordSearch,
  // The backend expects the hex colour without the leading '#'.
  redactColor: parameters.redactColor.replace("#", ""),
  customPadding: parameters.customPadding,
  convertPDFToImage: parameters.convertPDFToImage,
});

// Reconstruct the tool's UI parameters from an auto-redact request body.
export const redactFromApiParams = (
  apiParams: RedactApiParams,
): Partial<RedactParameters> => ({
  mode: "automatic",
  wordsToRedact: apiParams.listOfText ? apiParams.listOfText.split("\n") : [],
  useRegex: apiParams.useRegex ?? defaultParameters.useRegex,
  wholeWordSearch:
    apiParams.wholeWordSearch ?? defaultParameters.wholeWordSearch,
  redactColor: apiParams.redactColor
    ? `#${apiParams.redactColor}`
    : defaultParameters.redactColor,
  customPadding: apiParams.customPadding,
  convertPDFToImage:
    apiParams.convertPDFToImage ?? defaultParameters.convertPDFToImage,
});

// Static configuration that can be used by both the hook and automation executor
export const buildRedactFormData = (
  parameters: RedactParameters,
  file: File,
): FormData => {
  // Manual redaction uses EmbedPDF in-viewer and makes no API call; return an
  // empty payload to satisfy the shared interface without throwing.
  if (parameters.mode !== "automatic") {
    return new FormData();
  }
  return objectToFormData(redactToApiParams(parameters), { fileInput: file });
};

// Static configuration object
export const redactOperationConfig = defineSingleFileTool({
  toolType: ToolType.singleFile,
  buildFormData: buildRedactFormData,
  toApiParams: redactToApiParams,
  fromApiParams: redactFromApiParams,
  operationType: "redact",
  endpoint: (parameters: RedactParameters) =>
    parameters.mode === "automatic" ? AUTO_ENDPOINT : null,
  defaultParameters,
});

export const useRedactOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RedactParameters>({
    ...redactOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("redact.error.failed", "An error occurred while redacting the PDF."),
    ),
  });
};
