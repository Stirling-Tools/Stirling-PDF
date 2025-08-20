import { SPLIT_MODES, SPLIT_TYPES, ENDPOINTS, type SplitMode, SplitType } from '../../../constants/splitConstants';
import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface SplitParameters extends BaseParameters {
  mode: SplitMode | '';
  pages: string;
  hDiv: string;
  vDiv: string;
  merge: boolean;
  splitType: SplitType | '';
  splitValue: string;
  bookmarkLevel: string;
  includeMetadata: boolean;
  allowDuplicates: boolean;
}

export type SplitParametersHook = BaseParametersHook<SplitParameters>;

const defaultParameters: SplitParameters = {
  mode: '',
  pages: '',
  hDiv: '2',
  vDiv: '2',
  merge: false,
  splitType: SPLIT_TYPES.SIZE,
  splitValue: '',
  bookmarkLevel: '1',
  includeMetadata: false,
  allowDuplicates: false,
};

export const useSplitParameters = (): SplitParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => {
      if (!params.mode) return ENDPOINTS[SPLIT_MODES.BY_PAGES];
      return ENDPOINTS[params.mode as SplitMode];
    },
    validateFn: (params) => {
      if (!params.mode) return false;

      switch (params.mode) {
        case SPLIT_MODES.BY_PAGES:
          return params.pages.trim() !== "";
        case SPLIT_MODES.BY_SECTIONS:
          return params.hDiv !== "" && params.vDiv !== "";
        case SPLIT_MODES.BY_SIZE_OR_COUNT:
          return params.splitValue.trim() !== "";
        case SPLIT_MODES.BY_CHAPTERS:
          return params.bookmarkLevel !== "";
        default:
          return false;
      }
    },
  });
};
