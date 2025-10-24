import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface ChangePermissionsParameters extends BaseParameters {
  preventAssembly: boolean;
  preventExtractContent: boolean;
  preventExtractForAccessibility: boolean;
  preventFillInForm: boolean;
  preventModify: boolean;
  preventModifyAnnotations: boolean;
  preventPrinting: boolean;
  preventPrintingFaithful: boolean;
}

export const defaultParameters: ChangePermissionsParameters = {
  preventAssembly: false,
  preventExtractContent: false,
  preventExtractForAccessibility: false,
  preventFillInForm: false,
  preventModify: false,
  preventModifyAnnotations: false,
  preventPrinting: false,
  preventPrintingFaithful: false,
};

export type ChangePermissionsParametersHook = BaseParametersHook<ChangePermissionsParameters>;

export const useChangePermissionsParameters = (): ChangePermissionsParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'add-password', // Change Permissions is a fake endpoint for the Add Password tool
  });
};
