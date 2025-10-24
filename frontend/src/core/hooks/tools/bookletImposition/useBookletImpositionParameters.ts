import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface BookletImpositionParameters extends BaseParameters {
  pagesPerSheet: 2;
  addBorder: boolean;
  spineLocation: 'LEFT' | 'RIGHT';
  addGutter: boolean;
  gutterSize: number;
  doubleSided: boolean;
  duplexPass: 'BOTH' | 'FIRST' | 'SECOND';
  flipOnShortEdge: boolean;
}

export const defaultParameters: BookletImpositionParameters = {
  pagesPerSheet: 2,
  addBorder: false,
  spineLocation: 'LEFT',
  addGutter: false,
  gutterSize: 12,
  doubleSided: true,
  duplexPass: 'BOTH',
  flipOnShortEdge: false,
};

export type BookletImpositionParametersHook = BaseParametersHook<BookletImpositionParameters>;

export const useBookletImpositionParameters = (): BookletImpositionParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'booklet-imposition',
    validateFn: (params) => {
      return params.pagesPerSheet === 2;
    },
  });
};