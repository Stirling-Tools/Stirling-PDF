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
  RemovePagesParameters,
  defaultParameters,
} from "@app/hooks/tools/removePages/useRemovePagesParameters";
// import { useToolResources } from '@app/hooks/tools/shared/useToolResources';

const ENDPOINT = "/api/v1/general/remove-pages" satisfies ToolEndpoint;
type RemovePagesApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the remove-pages request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const removePagesToApiParams = (
  parameters: RemovePagesParameters,
): RemovePagesApiParams => ({
  pageNumbers: parameters.pageNumbers.replace(/\s+/g, ""),
});

// Reconstruct the tool's UI parameters from a remove-pages request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const removePagesFromApiParams = (
  apiParams: RemovePagesApiParams,
): Partial<RemovePagesParameters> => ({
  pageNumbers: apiParams.pageNumbers ?? defaultParameters.pageNumbers,
});

export const buildRemovePagesFormData = (
  parameters: RemovePagesParameters,
  file: File,
): FormData =>
  objectToFormData(removePagesToApiParams(parameters), { fileInput: file });

export const removePagesOperationConfig = defineSingleFileTool({
  buildFormData: buildRemovePagesFormData,
  toApiParams: removePagesToApiParams,
  fromApiParams: removePagesFromApiParams,
  operationType: "removePages",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useRemovePagesOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemovePagesParameters>({
    ...removePagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("removePages.error.failed", "Failed to remove pages"),
    ),
  });
};
