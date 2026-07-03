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
  CompressParameters,
  defaultParameters,
} from "@app/hooks/tools/compress/useCompressParameters";

const ENDPOINT = "/api/v1/misc/compress-pdf" satisfies ToolEndpoint;
type CompressApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the compress-pdf request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const compressToApiParams = (
  parameters: CompressParameters,
): CompressApiParams => {
  const apiParams: CompressApiParams = {
    // compressionLevel is validated to 1-9 by the parameters hook. It is always
    // sent: in file-size mode the backend recomputes the level from the target
    // size (autoMode in CompressController), so this value only takes effect in
    // quality mode.
    optimizeLevel:
      parameters.compressionLevel as CompressApiParams["optimizeLevel"],
    grayscale: parameters.grayscale ?? false,
    lineArt: parameters.lineArt,
    linearize: parameters.linearize,
  };

  if (parameters.compressionMethod === "filesize" && parameters.fileSizeValue) {
    apiParams.expectedOutputSize = `${parameters.fileSizeValue}${parameters.fileSizeUnit}`;
  }

  if (parameters.lineArt) {
    apiParams.lineArtThreshold = parameters.lineArtThreshold;
    apiParams.lineArtEdgeLevel = parameters.lineArtEdgeLevel;
  }

  return apiParams;
};

// Reconstruct the tool's UI parameters from a compress-pdf request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const compressFromApiParams = (
  apiParams: CompressApiParams,
): Partial<CompressParameters> => {
  const result: Partial<CompressParameters> = {
    compressionLevel: apiParams.optimizeLevel,
    grayscale: apiParams.grayscale ?? defaultParameters.grayscale,
    lineArt: apiParams.lineArt ?? defaultParameters.lineArt,
    linearize: apiParams.linearize ?? defaultParameters.linearize,
  };

  if (apiParams.lineArtThreshold !== undefined) {
    result.lineArtThreshold = apiParams.lineArtThreshold;
  }
  if (apiParams.lineArtEdgeLevel !== undefined) {
    result.lineArtEdgeLevel = apiParams.lineArtEdgeLevel;
  }

  if (apiParams.expectedOutputSize) {
    result.compressionMethod = "filesize";
    const match = /^(\d+(?:\.\d+)?)(KB|MB)$/i.exec(
      apiParams.expectedOutputSize,
    );
    if (match) {
      result.fileSizeValue = match[1];
      result.fileSizeUnit = match[2].toUpperCase() as "KB" | "MB";
    }
  } else {
    result.compressionMethod = "quality";
  }

  return result;
};

// Static configuration that can be used by both the hook and automation executor
export const buildCompressFormData = (
  parameters: CompressParameters,
  file: File,
): FormData =>
  objectToFormData(compressToApiParams(parameters), { fileInput: file });

// Static configuration object
export const compressOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildCompressFormData,
  toApiParams: compressToApiParams,
  fromApiParams: compressFromApiParams,
  operationType: "compress",
  endpoint: ENDPOINT,
  defaultParameters,
} as const;

export const useCompressOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CompressParameters>({
    ...compressOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "compress.error.failed",
        "An error occurred while compressing the PDF.",
      ),
    ),
  });
};
