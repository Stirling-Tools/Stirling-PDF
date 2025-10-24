import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface RepairParameters extends BaseParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: RepairParameters = {
  // No parameters needed
};

export type RepairParametersHook = BaseParametersHook<RepairParameters>;

export const useRepairParameters = (): RepairParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'repair',
    // validateFn: optional custom validation if needed in future
  });
};