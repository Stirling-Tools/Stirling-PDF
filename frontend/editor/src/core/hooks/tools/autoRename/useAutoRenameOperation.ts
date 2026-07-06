import { useTranslation } from "react-i18next";
import {
  ToolType,
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
  AutoRenameParameters,
  defaultParameters,
} from "@app/hooks/tools/autoRename/useAutoRenameParameters";

const ENDPOINT = "/api/v1/misc/auto-rename" satisfies ToolEndpoint;
type AutoRenameApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the auto-rename request body. The return
// type is the generated backend model, so a spec change that renames or drops a
// field breaks the build here.
export const autoRenameToApiParams = (
  parameters: AutoRenameParameters,
): AutoRenameApiParams => ({
  useFirstTextAsFallback: parameters.useFirstTextAsFallback,
});

// Reconstruct the tool's UI parameters from an auto-rename request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const autoRenameFromApiParams = (
  apiParams: AutoRenameApiParams,
): Partial<AutoRenameParameters> => ({
  useFirstTextAsFallback:
    apiParams.useFirstTextAsFallback ??
    defaultParameters.useFirstTextAsFallback,
});

// Static function that can be used by both the hook and automation executor
export const buildAutoRenameFormData = (
  parameters: AutoRenameParameters,
  file: File,
): FormData =>
  objectToFormData(autoRenameToApiParams(parameters), { fileInput: file });

// Static configuration object
export const autoRenameOperationConfig = defineSingleFileTool({
  toolType: ToolType.singleFile,
  buildFormData: buildAutoRenameFormData,
  toApiParams: autoRenameToApiParams,
  fromApiParams: autoRenameFromApiParams,
  operationType: "autoRename",
  endpoint: ENDPOINT,
  preserveBackendFilename: true, // Use filename from backend response headers
  defaultParameters,
});

export const useAutoRenameOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...autoRenameOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "auto-rename.error.failed",
        "An error occurred while auto-renaming the PDF.",
      ),
    ),
  });
};
