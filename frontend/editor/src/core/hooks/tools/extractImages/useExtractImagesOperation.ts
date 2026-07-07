import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolType,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  ExtractImagesParameters,
  defaultParameters,
} from "@app/hooks/tools/extractImages/useExtractImagesParameters";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";

const ENDPOINT = "/api/v1/misc/extract-images" satisfies ToolEndpoint;
type ExtractImagesApiParams = ToolApiParams[typeof ENDPOINT];

// The frontend param type uses "jpg" while the backend model uses "jpeg"; the
// wire value is preserved verbatim (as the pre-mapper code did) via the cast.
export const extractImagesToApiParams = (
  parameters: ExtractImagesParameters,
): ExtractImagesApiParams => ({
  format: parameters.format as ExtractImagesApiParams["format"],
});

export const extractImagesFromApiParams = (
  apiParams: ExtractImagesApiParams,
): Partial<ExtractImagesParameters> => ({
  format: apiParams.format as ExtractImagesParameters["format"],
});

// Static configuration that can be used by both the hook and automation executor
export const buildExtractImagesFormData = (
  parameters: ExtractImagesParameters,
  file: File,
): FormData =>
  objectToFormData(extractImagesToApiParams(parameters), { fileInput: file });

// Static configuration object (without response handler - will be added in hook)
export const extractImagesOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildExtractImagesFormData,
  toApiParams: extractImagesToApiParams,
  fromApiParams: extractImagesFromApiParams,
  operationType: "extractImages",
  endpoint: ENDPOINT,
  defaultParameters,
} as const;

export const useExtractImagesOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // Response handler that respects auto-unzip preferences
  const responseHandler = useCallback(
    async (blob: Blob, _originalFiles: File[]): Promise<File[]> => {
      // Extract images returns a ZIP file - use preference-aware extraction
      return await extractZipFiles(blob);
    },
    [extractZipFiles],
  );

  return useToolOperation<ExtractImagesParameters>({
    ...extractImagesOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(
      t(
        "extractImages.error.failed",
        "An error occurred while extracting images from the PDF.",
      ),
    ),
  });
};
