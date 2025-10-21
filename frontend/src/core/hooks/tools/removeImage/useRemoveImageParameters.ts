import { useBaseParameters } from '@app/hooks/tools/shared/useBaseParameters';
import type { BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export type RemoveImageParameters = Record<string, never>;

export const defaultParameters: RemoveImageParameters = {};

export type RemoveImageParametersHook = BaseParametersHook<RemoveImageParameters>;

export const useRemoveImageParameters = (): RemoveImageParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'remove-image-pdf',
  });
};


