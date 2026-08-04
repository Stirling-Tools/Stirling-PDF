import { useBaseParameters } from "@app/hooks/tools/shared/useBaseParameters";

export interface ReplaceImageParameters {
  imageIndex?: number;
  pageNumber?: number;
}

export const defaultParameters: ReplaceImageParameters = {
  imageIndex: undefined,
  pageNumber: undefined,
};

export const useReplaceImageParameters = () => {
  return useBaseParameters<ReplaceImageParameters>({
    defaultParameters,
    endpointName: "replace-image",
    validateFn: (params) => {
      // Validate that imageIndex is non-negative if provided
      if (params.imageIndex !== undefined && params.imageIndex < 0) {
        return false;
      }
      // Validate that pageNumber is positive if provided
      if (params.pageNumber !== undefined && params.pageNumber <= 0) {
        return false;
      }
      return true;
    },
  });
};
