import { SPLIT_METHODS, ENDPOINTS, type SplitMethod } from '../../../constants/splitConstants';
import { BaseParameters, ToggleableProcessingParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface SplitParameters extends BaseParameters, ToggleableProcessingParameters {
  method: SplitMethod | '';
  pages: string;
  hDiv: string;
  vDiv: string;
  merge: boolean;
  splitValue: string;
  bookmarkLevel: string;
  includeMetadata: boolean;
  allowDuplicates: boolean;
  duplexMode: boolean;
}

export type SplitParametersHook = BaseParametersHook<SplitParameters>;

export const defaultParameters: SplitParameters = {
  method: '',
  pages: '',
  hDiv: '2',
  vDiv: '2',
  merge: false,
  splitValue: '',
  bookmarkLevel: '1',
  includeMetadata: false,
  allowDuplicates: false,
  duplexMode: false,
  processingMode: 'backend',
};

export const useSplitParameters = (): SplitParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => {
      if (params.processingMode === 'frontend') return '';
      if (!params.method) return ENDPOINTS[SPLIT_METHODS.BY_PAGES];
      return ENDPOINTS[params.method as SplitMethod];
    },
    validateFn: (params) => {
      if (!params.method) return false;

      switch (params.method) {
        case SPLIT_METHODS.BY_PAGES:
          return params.pages.trim() !== "";
        case SPLIT_METHODS.BY_SECTIONS:
          return params.hDiv !== "" && params.vDiv !== "";
        case SPLIT_METHODS.BY_SIZE:
        case SPLIT_METHODS.BY_PAGE_COUNT:
        case SPLIT_METHODS.BY_DOC_COUNT:
          return params.splitValue.trim() !== "";
        case SPLIT_METHODS.BY_CHAPTERS:
          return params.bookmarkLevel !== "";
        case SPLIT_METHODS.BY_PAGE_DIVIDER:
          return true; // No required parameters
        default:
          return false;
      }
    },
  });
};
