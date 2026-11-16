import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface CompressParameters extends BaseParameters {
  compressionLevel: number;
  grayscale: boolean;
  lineArt: boolean;
  lineArtThreshold: number;
  lineArtEdgeLevel: 1 | 2 | 3;
  expectedSize: string;
  compressionMethod: "quality" | "filesize";
  fileSizeValue: string;
  fileSizeUnit: "KB" | "MB";
  linearize: boolean;
}

export const MIN_COMPRESSION_LEVEL = 1;
export const MAX_COMPRESSION_LEVEL = 9;

export const defaultParameters: CompressParameters = {
  compressionLevel: 5,
  grayscale: false,
  lineArt: false,
  lineArtThreshold: 50,
  lineArtEdgeLevel: 3,
  expectedSize: "",
  compressionMethod: "quality",
  fileSizeValue: "",
  fileSizeUnit: "MB",
  linearize: false,
};

/**
 * Whether a run with these parameters already used the strongest compression. File-size
 * mode counts: the backend raises the level itself until it meets the target or hits the
 * maximum, so a run that missed has already been through every level.
 */
export function usedStrongestCompression(params: CompressParameters): boolean {
  return (
    params.compressionMethod === "filesize" ||
    params.compressionLevel >= MAX_COMPRESSION_LEVEL
  );
}

export type CompressParametersHook = BaseParametersHook<CompressParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateCompressParameters(
  params: CompressParameters,
): boolean {
  if (
    params.compressionLevel < MIN_COMPRESSION_LEVEL ||
    params.compressionLevel > MAX_COMPRESSION_LEVEL
  ) {
    return false;
  }
  // Filesize mode needs a target size; without one the request omits
  // expectedOutputSize and the backend silently does a quality compression.
  if (params.compressionMethod === "filesize") {
    return params.fileSizeValue.trim() !== "";
  }
  return true;
}

export const useCompressParameters = (): CompressParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "compress-pdf",
    validateFn: validateCompressParameters,
  });
};
