import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface UnlockPdfFormsParameters extends BaseParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: UnlockPdfFormsParameters = {
  // No parameters needed
};

export type UnlockPdfFormsParametersHook = BaseParametersHook<UnlockPdfFormsParameters>;

export const useUnlockPdfFormsParameters = (): UnlockPdfFormsParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'unlock-pdf-forms',
  });
};