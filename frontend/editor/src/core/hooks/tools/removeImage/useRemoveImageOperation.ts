import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolOperationConfig,
  ToolType,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  fileOnlyMapping,
  objectToFormData,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import type { RemoveImageParameters } from "@app/hooks/tools/removeImage/useRemoveImageParameters";

const ENDPOINT = "/api/v1/general/remove-image-pdf" satisfies ToolEndpoint;

// Remove-image takes only a file; there are no request parameters to map.
const { toApiParams, fromApiParams } = fileOnlyMapping();

export const buildRemoveImageFormData = (
  _params: RemoveImageParameters,
  file: File,
): FormData => objectToFormData(toApiParams(), { fileInput: file });

export const removeImageOperationConfig: ToolOperationConfig<RemoveImageParameters> =
  {
    toolType: ToolType.singleFile,
    buildFormData: buildRemoveImageFormData,
    toApiParams,
    fromApiParams,
    operationType: "removeImage",
    endpoint: ENDPOINT,
  };

export const useRemoveImageOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveImageParameters>({
    ...removeImageOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("removeImage.error.failed", "Failed to remove images from the PDF."),
    ),
  });
};
