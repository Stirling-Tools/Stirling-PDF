import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, type BaseParametersHook } from '../../../hooks/tools/shared/useBaseParameters';

export interface AddPageNumbersParameters extends BaseParameters {
  customMargin: 'small' | 'medium' | 'large' | 'x-large';
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  fontSize: number;
  fontType: 'Times' | 'Helvetica' | 'Courier';
  startingNumber: number;
  pagesToNumber: string;
  customText: string;
}

export const defaultParameters: AddPageNumbersParameters = {
  customMargin: 'medium',
  position: 8, // Default to bottom center like the original HTML
  fontSize: 12,
  fontType: 'Times',
  startingNumber: 1,
  pagesToNumber: '',
  customText: '',
};

export type AddPageNumbersParametersHook = BaseParametersHook<AddPageNumbersParameters>;

export const useAddPageNumbersParameters = (): AddPageNumbersParametersHook => {
  return useBaseParameters<AddPageNumbersParameters>({
    defaultParameters,
    endpointName: 'add-page-numbers',
    validateFn: (params): boolean => {
      return params.fontSize > 0 && params.startingNumber > 0;
    },
  });
};