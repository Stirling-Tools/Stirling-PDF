import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";
import type { DocparseMode } from "@app/hooks/tools/parseDocument/useParseDocumentParameters";

export interface ChunkDocumentParameters extends BaseParameters {
  /** Target chunk size in characters. */
  chunkSize: number;
  /** Characters of overlap carried between neighbouring chunks. */
  overlap: number;
  mode: DocparseMode;
}

export const defaultParameters: ChunkDocumentParameters = {
  chunkSize: 1000,
  overlap: 100,
  mode: "auto",
};

export type ChunkDocumentParametersHook =
  BaseParametersHook<ChunkDocumentParameters>;

export const useChunkDocumentParameters = (): ChunkDocumentParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "chunk-document",
    validateFn: (params) =>
      params.chunkSize > 0 &&
      params.overlap >= 0 &&
      params.overlap < params.chunkSize,
  });
};
