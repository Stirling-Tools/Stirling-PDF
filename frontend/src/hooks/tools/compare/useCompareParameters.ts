import { BaseParametersHook, useBaseParameters } from '../shared/useBaseParameters';
import type { FileId } from '../../../types/file';

export interface CompareParameters {
  baseFileId: FileId | null;
  comparisonFileId: FileId | null;
}

export const defaultParameters: CompareParameters = {
  baseFileId: null,
  comparisonFileId: null,
};

export type CompareParametersHook = BaseParametersHook<CompareParameters>;

export const useCompareParameters = (): CompareParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'compare',
    validateFn: (params) =>
      Boolean(params.baseFileId && params.comparisonFileId && params.baseFileId !== params.comparisonFileId),
  });
};
