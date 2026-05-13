import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import {
  type CustomToolOperationConfig,
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  ReplaceColorParameters,
  defaultParameters,
} from "@app/hooks/tools/replaceColor/useReplaceColorParameters";

export const buildReplaceColorFormData = (
  parameters: ReplaceColorParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  if (parameters.mode === "TEXT_COLOR_REPLACEMENT") {
    for (const sourceColor of parameters.sourceColors) {
      formData.append("sourceColors", sourceColor);
    }
    formData.append("targetColor", parameters.targetColor);
    return formData;
  }

  formData.append("replaceAndInvertOption", parameters.replaceAndInvertOption);

  if (parameters.replaceAndInvertOption === "HIGH_CONTRAST_COLOR") {
    formData.append(
      "highContrastColorCombination",
      parameters.highContrastColorCombination,
    );
  } else if (parameters.replaceAndInvertOption === "CUSTOM_COLOR") {
    formData.append("textColor", parameters.textColor);
    formData.append("backGroundColor", parameters.backGroundColor);
  }

  return formData;
};

const resolveReplaceColorEndpoint = (params: ReplaceColorParameters): string =>
  params.mode === "TEXT_COLOR_REPLACEMENT"
    ? "/api/v1/misc/replace-text-colors"
    : "/api/v1/misc/replace-invert-pdf";

export const replaceColorOperationConfig: CustomToolOperationConfig<ReplaceColorParameters> =
  {
    toolType: ToolType.custom,
    operationType: "replaceColor",
    endpoint: resolveReplaceColorEndpoint,
    defaultParameters,
    customProcessor: async (params, files) => {
      const outputFiles: File[] = [];
      for (const file of files) {
        const formData = buildReplaceColorFormData(params, file);
        const response = await apiClient.post(
          resolveReplaceColorEndpoint(params),
          formData,
          { responseType: "blob" },
        );

        outputFiles.push(
          new File([response.data], file.name, {
            type: "application/pdf",
          }),
        );
      }

      return {
        files: outputFiles,
      };
    },
  };

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
