import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

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

export type CompressParametersHook = BaseParametersHook<CompressParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateCompressParameters(
  params: CompressParameters,
): boolean {
  if (params.compressionLevel < 1 || params.compressionLevel > 9) {
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
