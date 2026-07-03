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
  ScannerImageSplitParameters,
  defaultParameters,
} from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitParameters";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";

const ENDPOINT = "/api/v1/misc/extract-image-scans" satisfies ToolEndpoint;
type ScannerImageSplitApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the extract-image-scans request body.
// The frontend uses snake_case field names, but the backend model (the contract)
// uses camelCase, so the keys are renamed here.
export const scannerImageSplitToApiParams = (
  parameters: ScannerImageSplitParameters,
): ScannerImageSplitApiParams => ({
  angleThreshold: parameters.angle_threshold,
  tolerance: parameters.tolerance,
  minArea: parameters.min_area,
  minContourArea: parameters.min_contour_area,
  borderSize: parameters.border_size,
});

// Reconstruct the tool's UI parameters from an extract-image-scans request body,
// so a stored or AI-authored step can be re-rendered in the settings UI.
export const scannerImageSplitFromApiParams = (
  apiParams: ScannerImageSplitApiParams,
): Partial<ScannerImageSplitParameters> => ({
  angle_threshold: apiParams.angleThreshold,
  tolerance: apiParams.tolerance,
  min_area: apiParams.minArea,
  min_contour_area: apiParams.minContourArea,
  border_size: apiParams.borderSize,
});

export const buildScannerImageSplitFormData = (
  parameters: ScannerImageSplitParameters,
  file: File,
): FormData =>
  objectToFormData(scannerImageSplitToApiParams(parameters), {
    fileInput: file,
  });

// Static configuration object
export const scannerImageSplitOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildScannerImageSplitFormData,
  toApiParams: scannerImageSplitToApiParams,
  fromApiParams: scannerImageSplitFromApiParams,
  operationType: "scannerImageSplit",
  endpoint: ENDPOINT,
  defaultParameters,
} as const;

export const useScannerImageSplitOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // Custom response handler that extracts ZIP files containing images
  // Can't add to exported config because it requires access to the hook so must be part of the hook
  const responseHandler = useCallback(
    async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
      try {
        // Scanner image split returns ZIP files with multiple images
        const extractedFiles = await extractZipFiles(blob);

        // If extraction succeeded and returned files, use them
        if (extractedFiles.length > 0) {
          return extractedFiles;
        }
      } catch (error) {
        console.warn(
          "Failed to extract as ZIP, treating as single file:",
          error,
        );
      }

      // Fallback: treat as single file (PNG image)
      const inputFileName = originalFiles[0]?.name || "document";
      const baseFileName = inputFileName.replace(/\.[^.]+$/, "");
      const singleFile = new File([blob], `${baseFileName}.png`, {
        type: "image/png",
      });
      return [singleFile];
    },
    [extractZipFiles],
  );

  const config: ToolOperationConfig<ScannerImageSplitParameters> = {
    ...scannerImageSplitOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(
      t(
        "scannerImageSplit.error.failed",
        "An error occurred while extracting image scans.",
      ),
    ),
  };

  return useToolOperation(config);
};
