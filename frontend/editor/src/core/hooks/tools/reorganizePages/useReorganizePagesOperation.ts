import { useTranslation } from "react-i18next";
import {
  defineSingleFileTool,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  ReorganizePagesParameters,
  defaultReorganizePagesParameters,
} from "@app/hooks/tools/reorganizePages/useReorganizePagesParameters";

const ENDPOINT = "/api/v1/general/rearrange-pages" satisfies ToolEndpoint;
type ReorganizePagesApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the rearrange-pages request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const reorganizePagesToApiParams = (
  parameters: ReorganizePagesParameters,
): ReorganizePagesApiParams => {
  const apiParams: ReorganizePagesApiParams = {};
  if (parameters.customMode) {
    apiParams.customMode =
      parameters.customMode as ReorganizePagesApiParams["customMode"];
  }
  if (parameters.pageNumbers) {
    apiParams.pageNumbers = parameters.pageNumbers.replace(/\s+/g, "");
  }
  return apiParams;
};

// Reconstruct the tool's UI parameters from a rearrange-pages request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const reorganizePagesFromApiParams = (
  apiParams: ReorganizePagesApiParams,
): Partial<ReorganizePagesParameters> => ({
  customMode:
    apiParams.customMode ?? defaultReorganizePagesParameters.customMode,
  pageNumbers:
    apiParams.pageNumbers ?? defaultReorganizePagesParameters.pageNumbers,
});

const buildFormData = (
  parameters: ReorganizePagesParameters,
  file: File,
): FormData =>
  objectToFormData(reorganizePagesToApiParams(parameters), {
    fileInput: file,
  });

export const reorganizePagesOperationConfig = defineSingleFileTool({
  buildFormData,
  toApiParams: reorganizePagesToApiParams,
  fromApiParams: reorganizePagesFromApiParams,
  operationType: "reorganizePages",
  endpoint: ENDPOINT,
});

export const useReorganizePagesOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<ReorganizePagesParameters>({
    ...reorganizePagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("reorganizePages.error.failed", "Failed to reorganize pages"),
    ),
  });
};
