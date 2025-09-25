import { useBaseParameters } from '../shared/useBaseParameters';

// Remove annotations is a simple tool with no configurable parameters
export interface RemoveAnnotationsParameters {
  // No parameters needed - this tool just removes all annotations
}

export const defaultParameters: RemoveAnnotationsParameters = {
};

export const useRemoveAnnotationsParameters = () => {
  return useBaseParameters<RemoveAnnotationsParameters>({
    defaultParameters,
    endpointName: 'remove-annotations', // Not used for client-side processing, but required by base hook
    validateFn: () => true, // No parameters to validate
  });
};