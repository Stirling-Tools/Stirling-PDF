import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  FlattenParameters,
  defaultParameters,
} from "@app/hooks/tools/flatten/useFlattenParameters";

const ENDPOINT = "/api/v1/misc/flatten" satisfies ToolEndpoint;
type FlattenApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the flatten request body. The return
// type is the generated backend model, so a spec change that renames or drops a
// field breaks the build here.
export const flattenToApiParams = (
  parameters: FlattenParameters,
): FlattenApiParams => {
  const apiParams: FlattenApiParams = {
    flattenOnlyForms: parameters.flattenOnlyForms,
  };

  if (parameters.renderDpi != null) {
    apiParams.renderDpi = parameters.renderDpi;
  }

  return apiParams;
};

// Reconstruct the tool's UI parameters from a flatten request body, so a stored
// or AI-authored step can be re-rendered in the settings UI.
export const flattenFromApiParams = (
  apiParams: FlattenApiParams,
): Partial<FlattenParameters> => {
  const result: Partial<FlattenParameters> = {
    flattenOnlyForms: apiParams.flattenOnlyForms ?? false,
  };

  if (apiParams.renderDpi != null) {
    result.renderDpi = apiParams.renderDpi;
  }

  return result;
};

// Static function that can be used by both the hook and automation executor
export const buildFlattenFormData = (
  parameters: FlattenParameters,
  file: File,
): FormData =>
  objectToFormData(flattenToApiParams(parameters), { fileInput: file });

// Static configuration object
export const flattenOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildFlattenFormData,
  toApiParams: flattenToApiParams,
  fromApiParams: flattenFromApiParams,
  operationType: "flatten",
  endpoint: ENDPOINT,
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useFlattenOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<FlattenParameters>({
    ...flattenOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("flatten.error.failed", "An error occurred while flattening the PDF."),
    ),
  });
};
