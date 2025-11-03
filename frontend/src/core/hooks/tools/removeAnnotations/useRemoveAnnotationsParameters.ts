import { useBaseParameters } from '@app/hooks/tools/shared/useBaseParameters';

export type RemoveAnnotationsParameters = Record<string, never>

export const defaultParameters: RemoveAnnotationsParameters = {
};

export const useRemoveAnnotationsParameters = () => {
  return useBaseParameters<RemoveAnnotationsParameters>({
    defaultParameters,
    endpointName: 'remove-annotations', // Not used for client-side processing, but required by base hook
    validateFn: () => true, // No parameters to validate
  });
};