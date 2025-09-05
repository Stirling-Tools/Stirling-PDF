import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface BookletImpositionParameters extends BaseParameters {
  bookletType: 'BOOKLET' | 'SIDE_STITCH_BOOKLET';
  pagesPerSheet: 2 | 4;
  addBorder: boolean;
  pageOrientation: 'LANDSCAPE' | 'PORTRAIT';
}

export const defaultParameters: BookletImpositionParameters = {
  bookletType: 'BOOKLET',
  pagesPerSheet: 2,
  addBorder: false,
  pageOrientation: 'LANDSCAPE',
};

export type BookletImpositionParametersHook = BaseParametersHook<BookletImpositionParameters>;

export const useBookletImpositionParameters = (): BookletImpositionParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'booklet-imposition',
    validateFn: (params) => {
      return params.pagesPerSheet === 2 || params.pagesPerSheet === 4;
    },
  });
};