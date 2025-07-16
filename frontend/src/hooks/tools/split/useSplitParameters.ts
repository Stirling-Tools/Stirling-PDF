import { useState } from 'react';
import { SPLIT_MODES, SPLIT_TYPES, ENDPOINTS, type SplitMode, type SplitType } from '../../../constants/splitConstants';
import { SplitParameters } from '../../../components/tools/split/SplitSettings';

export interface SplitParametersHook {
  mode: SplitMode | '';
  parameters: SplitParameters;
  setMode: (mode: SplitMode | '') => void;
  updateParameter: (parameter: keyof SplitParameters, value: string | boolean) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

const initialParameters: SplitParameters = {
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
  const [mode, setMode] = useState<SplitMode | ''>('');
  const [parameters, setParameters] = useState<SplitParameters>(initialParameters);

  const updateParameter = (parameter: keyof SplitParameters, value: string | boolean) => {
    setParameters(prev => ({ ...prev, [parameter]: value }));
  };

  const resetParameters = () => {
    setParameters(initialParameters);
    setMode('');
  };

  const validateParameters = () => {
    if (!mode) return false;

    switch (mode) {
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
    if (!mode) return ENDPOINTS[SPLIT_MODES.BY_PAGES];
    return ENDPOINTS[mode as SplitMode];
  };

  return {
    mode,
    parameters,
    setMode,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};