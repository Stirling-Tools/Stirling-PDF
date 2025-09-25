import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface ReplaceColorParameters extends BaseParameters {
  replaceAndInvertOption: 'HIGH_CONTRAST_COLOR' | 'CUSTOM_COLOR' | 'FULL_INVERSION';
  highContrastColorCombination: 'WHITE_TEXT_ON_BLACK' | 'BLACK_TEXT_ON_WHITE' | 'YELLOW_TEXT_ON_BLACK' | 'GREEN_TEXT_ON_BLACK';
  textColor: string;
  backGroundColor: string;
}

export const defaultParameters: ReplaceColorParameters = {
  replaceAndInvertOption: 'HIGH_CONTRAST_COLOR',
  highContrastColorCombination: 'WHITE_TEXT_ON_BLACK',
  textColor: '#000000',
  backGroundColor: '#ffffff',
};

export type ReplaceColorParametersHook = BaseParametersHook<ReplaceColorParameters>;

export const useReplaceColorParameters = (): ReplaceColorParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'replace-invert-pdf',
    validateFn: (params) => {
      // All parameters are always valid as they have defaults
      return true;
    },
  });
};