import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  SanitizeParameters,
  defaultParameters,
} from "@app/hooks/tools/sanitize/useSanitizeParameters";

const ENDPOINT = "/api/v1/security/sanitize-pdf" satisfies ToolEndpoint;
type SanitizeApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the sanitize-pdf request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const sanitizeToApiParams = (
  parameters: SanitizeParameters,
): SanitizeApiParams => ({
  removeJavaScript: parameters.removeJavaScript ?? false,
  removeEmbeddedFiles: parameters.removeEmbeddedFiles ?? false,
  removeXMPMetadata: parameters.removeXMPMetadata ?? false,
  removeMetadata: parameters.removeMetadata ?? false,
  removeLinks: parameters.removeLinks ?? false,
  removeFonts: parameters.removeFonts ?? false,
});

// Reconstruct the tool's UI parameters from a sanitize-pdf request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const sanitizeFromApiParams = (
  apiParams: SanitizeApiParams,
): Partial<SanitizeParameters> => ({
  removeJavaScript:
    apiParams.removeJavaScript ?? defaultParameters.removeJavaScript,
  removeEmbeddedFiles:
    apiParams.removeEmbeddedFiles ?? defaultParameters.removeEmbeddedFiles,
  removeXMPMetadata:
    apiParams.removeXMPMetadata ?? defaultParameters.removeXMPMetadata,
  removeMetadata: apiParams.removeMetadata ?? defaultParameters.removeMetadata,
  removeLinks: apiParams.removeLinks ?? defaultParameters.removeLinks,
  removeFonts: apiParams.removeFonts ?? defaultParameters.removeFonts,
});

// Static function that can be used by both the hook and automation executor
export const buildSanitizeFormData = (
  parameters: SanitizeParameters,
  file: File,
): FormData =>
  objectToFormData(sanitizeToApiParams(parameters), { fileInput: file });

// Static configuration object
export const sanitizeOperationConfig = defineSingleFileTool({
  buildFormData: buildSanitizeFormData,
  toApiParams: sanitizeToApiParams,
  fromApiParams: sanitizeFromApiParams,
  operationType: "sanitize",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useSanitizeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SanitizeParameters>({
    ...sanitizeOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("sanitize.error.failed", "An error occurred while sanitising the PDF."),
    ),
  });
};
