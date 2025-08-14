import { useState } from 'react';
import { SPLIT_MODES, SPLIT_TYPES, ENDPOINTS, type SplitMode, SplitType } from '../../../constants/splitConstants';

export interface SplitParameters {
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

export interface SplitParametersHook {
  parameters: SplitParameters;
  updateParameter: (parameter: keyof SplitParameters, value: string | boolean) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

const initialParameters: SplitParameters = {
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
  const [parameters, setParameters] = useState<SplitParameters>(initialParameters);

  const updateParameter = (parameter: keyof SplitParameters, value: string | boolean) => {
    setParameters(prev => ({ ...prev, [parameter]: value }));
  };

  const resetParameters = () => {
    setParameters(initialParameters);
  };

  const validateParameters = () => {
    if (!parameters.mode) return false;

    switch (parameters.mode) {
      case SPLIT_MODES.BY_PAGES:
        return parameters.pages.trim() !== "";
      case SPLIT_MODES.BY_SECTIONS:
        return parameters.hDiv !== "" && parameters.vDiv !== "";
      case SPLIT_MODES.BY_SIZE_OR_COUNT:
        return parameters.splitValue.trim() !== "";
      case SPLIT_MODES.BY_CHAPTERS:
        return parameters.bookmarkLevel !== "";
      default:
        return false;
    }
  };

  const getEndpointName = () => {
    if (!parameters.mode) return ENDPOINTS[SPLIT_MODES.BY_PAGES];
    return ENDPOINTS[parameters.mode as SplitMode];
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};
