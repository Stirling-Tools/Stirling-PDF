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
  ReplaceColorParameters,
  defaultParameters,
} from "@app/hooks/tools/replaceColor/useReplaceColorParameters";

const ENDPOINT = "/api/v1/misc/replace-invert-pdf" satisfies ToolEndpoint;
type ReplaceColorApiParams = ToolApiParams[typeof ENDPOINT];

export const replaceColorToApiParams = (
  parameters: ReplaceColorParameters,
): ReplaceColorApiParams => {
  const apiParams: ReplaceColorApiParams = {
    replaceAndInvertOption: parameters.replaceAndInvertOption,
  };

  if (parameters.replaceAndInvertOption === "HIGH_CONTRAST_COLOR") {
    apiParams.highContrastColorCombination =
      parameters.highContrastColorCombination;
  } else if (parameters.replaceAndInvertOption === "CUSTOM_COLOR") {
    apiParams.textColor = parameters.textColor;
    apiParams.backGroundColor = parameters.backGroundColor;
  }

  return apiParams;
};

export const replaceColorFromApiParams = (
  apiParams: ReplaceColorApiParams,
): Partial<ReplaceColorParameters> => {
  const result: Partial<ReplaceColorParameters> = {
    replaceAndInvertOption: apiParams.replaceAndInvertOption,
  };

  if (apiParams.highContrastColorCombination !== undefined) {
    result.highContrastColorCombination =
      apiParams.highContrastColorCombination;
  }
  if (apiParams.textColor !== undefined) {
    result.textColor = apiParams.textColor;
  }
  if (apiParams.backGroundColor !== undefined) {
    result.backGroundColor = apiParams.backGroundColor;
  }

  return result;
};

export const buildReplaceColorFormData = (
  parameters: ReplaceColorParameters,
  file: File,
): FormData =>
  objectToFormData(replaceColorToApiParams(parameters), { fileInput: file });

export const replaceColorOperationConfig = defineSingleFileTool({
  buildFormData: buildReplaceColorFormData,
  toApiParams: replaceColorToApiParams,
  fromApiParams: replaceColorFromApiParams,
  operationType: "replaceColor",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useReplaceColorOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ReplaceColorParameters>({
    ...replaceColorOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "replaceColor.error.failed",
        "An error occurred while processing the colour replacement.",
      ),
    ),
  });
};
