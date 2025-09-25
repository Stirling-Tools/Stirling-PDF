import { useBaseParameters } from '../shared/useBaseParameters';
import type { BaseParametersHook } from '../shared/useBaseParameters';

export interface RemoveImageParameters {}

export const defaultParameters: RemoveImageParameters = {};

export type RemoveImageParametersHook = BaseParametersHook<RemoveImageParameters>;

export const useRemoveImageParameters = (): RemoveImageParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'remove-image-pdf',
  });
};


