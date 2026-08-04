import { useCallback } from "react";
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
  ReplaceImageParameters,
  defaultParameters,
} from "@app/hooks/tools/replaceImage/useReplaceImageParameters";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";

const ENDPOINT = "/api/v1/misc/replace-image" satisfies ToolEndpoint;
type ReplaceImageApiParams = ToolApiParams[typeof ENDPOINT];

export const replaceImageToApiParams = (
  parameters: ReplaceImageParameters,
): ReplaceImageApiParams => ({
  imageIndex: parameters.imageIndex,
  pageNumber: parameters.pageNumber,
});

export const replaceImageFromApiParams = (
  apiParams: ReplaceImageApiParams,
): Partial<ReplaceImageParameters> => ({
  imageIndex: apiParams.imageIndex,
  pageNumber: apiParams.pageNumber,
});

// Static configuration that can be used by both the hook and automation executor
export const buildReplaceImageFormData = (
  parameters: ReplaceImageParameters,
  file: File,
  replacementImage: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("replacementImage", replacementImage);
  
  if (parameters.imageIndex !== undefined) {
    formData.append("imageIndex", parameters.imageIndex.toString());
  }
  if (parameters.pageNumber !== undefined) {
    formData.append("pageNumber", parameters.pageNumber.toString());
  }
  
  return formData;
};

// Static configuration object (without response handler - will be added in hook)
export const replaceImageOperationConfig = defineSingleFileTool({
  buildFormData: (params: ReplaceImageParameters, file: File) => {
    // This will be overridden in the hook to include replacementImage
    throw new Error("buildFormData must be called with replacementImage");
  },
  toApiParams: replaceImageToApiParams,
  fromApiParams: replaceImageFromApiParams,
  operationType: "replaceImage",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useReplaceImageOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ReplaceImageParameters>({
    ...replaceImageOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "replaceImage.error.failed",
        "An error occurred while replacing images in the PDF.",
      ),
    ),
  });
};
