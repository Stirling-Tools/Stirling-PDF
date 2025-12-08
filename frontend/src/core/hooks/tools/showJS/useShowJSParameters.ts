import { useBaseParameters, type BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import { BaseParameters } from '@app/types/parameters';

export interface ShowJSParameters extends BaseParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: ShowJSParameters = {
  // No parameters needed
};


export type ShowJSParametersHook = BaseParametersHook<ShowJSParameters>;

export const useShowJSParameters = (): ShowJSParametersHook => {
	return useBaseParameters({
		defaultParameters,
		endpointName: 'show-javascript',
	});
};

