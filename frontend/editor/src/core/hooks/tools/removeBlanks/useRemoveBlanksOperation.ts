import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
  ToolOperationConfig,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  RemoveBlanksParameters,
  defaultParameters,
} from "@app/hooks/tools/removeBlanks/useRemoveBlanksParameters";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";

const ENDPOINT = "/api/v1/misc/remove-blanks" satisfies ToolEndpoint;
type RemoveBlanksApiParams = ToolApiParams[typeof ENDPOINT];

// Note: includeBlankPages is not sent to backend as it always returns both files in a ZIP
export const removeBlanksToApiParams = (
  parameters: RemoveBlanksParameters,
): RemoveBlanksApiParams => ({
  threshold: parameters.threshold,
  whitePercent: parameters.whitePercent,
});

export const removeBlanksFromApiParams = (
  apiParams: RemoveBlanksApiParams,
): Partial<RemoveBlanksParameters> => ({
  threshold: apiParams.threshold,
  whitePercent: apiParams.whitePercent,
});

export const buildRemoveBlanksFormData = (
  parameters: RemoveBlanksParameters,
  file: File,
): FormData =>
  objectToFormData(removeBlanksToApiParams(parameters), { fileInput: file });

export const removeBlanksOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemoveBlanksFormData,
  toApiParams: removeBlanksToApiParams,
  fromApiParams: removeBlanksFromApiParams,
  operationType: "removeBlanks",
  endpoint: ENDPOINT,
  defaultParameters,
} as const satisfies ToolOperationConfig<RemoveBlanksParameters>;

export const useRemoveBlanksOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  const responseHandler = useCallback(
    async (blob: Blob): Promise<File[]> => {
      // Backend always returns a ZIP file containing the processed PDFs
      return await extractZipFiles(blob);
    },
    [extractZipFiles],
  );

  return useToolOperation<RemoveBlanksParameters>({
    ...removeBlanksOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(
      t("removeBlanks.error.failed", "Failed to remove blank pages"),
    ),
  });
};
