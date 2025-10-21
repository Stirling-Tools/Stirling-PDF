import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, type BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface AddStampParameters extends BaseParameters {
  stampType?: 'text' | 'image';
  stampText: string;
  stampImage?: File;
  alphabet: 'roman' | 'arabic' | 'japanese' | 'korean' | 'chinese' | 'thai';
  fontSize: number; 
  rotation: number; 
  opacity: number;
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; 
  overrideX: number;
  overrideY: number; 
  customMargin: 'small' | 'medium' | 'large' | 'x-large';
  customColor: string;
  pageNumbers: string;
  _activePill: 'fontSize' | 'rotation' | 'opacity';
}

export const defaultParameters: AddStampParameters = {
  stampType: 'text',
  stampText: '',
  alphabet: 'roman',
  fontSize: 80,
  rotation: 0,
  opacity: 50,
  position: 5,
  overrideX: -1,
  overrideY: -1,
  customMargin: 'medium',
  customColor: '#d3d3d3',
  pageNumbers: '1',
  _activePill: 'fontSize',
};

export type AddStampParametersHook = BaseParametersHook<AddStampParameters>;

export const useAddStampParameters = (): AddStampParametersHook => {
  return useBaseParameters<AddStampParameters>({
    defaultParameters,
    endpointName: 'add-stamp',
    validateFn: (params): boolean => {
      if (!params.stampType) return false;
      if (params.stampType === 'text') {
        return params.stampText.trim().length > 0;
      }
      return params.stampImage !== undefined;
    },
  });
};


