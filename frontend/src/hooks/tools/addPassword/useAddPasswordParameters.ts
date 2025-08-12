import { useState } from 'react';

export interface AddPasswordParameters {
  password: string;
  ownerPassword: string;
  keyLength: number;
  preventAssembly: boolean;
  preventExtractContent: boolean;
  preventExtractForAccessibility: boolean;
  preventFillInForm: boolean;
  preventModify: boolean;
  preventModifyAnnotations: boolean;
  preventPrinting: boolean;
  preventPrintingFaithful: boolean;
}

export interface AddPasswordParametersHook {
  parameters: AddPasswordParameters;
  updateParameter: (parameter: keyof AddPasswordParameters, value: string | boolean | number) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

const initialParameters: AddPasswordParameters = {
  password: '',
  ownerPassword: '',
  keyLength: 128,
  preventAssembly: false,
  preventExtractContent: false,
  preventExtractForAccessibility: false,
  preventFillInForm: false,
  preventModify: false,
  preventModifyAnnotations: false,
  preventPrinting: false,
  preventPrintingFaithful: false,
};

export const useAddPasswordParameters = (): AddPasswordParametersHook => {
  const [parameters, setParameters] = useState<AddPasswordParameters>(initialParameters);

  const updateParameter = <K extends keyof AddPasswordParameters>(parameter: K, value: AddPasswordParameters[K]) => {
    setParameters(prev => ({
       ...prev,
       [parameter]: value,
      })
    );
  };

  const resetParameters = () => {
    setParameters(initialParameters);
  };

  const validateParameters = () => {
    // At least one password should be provided, or if no passwords, at least one permission should be restricted
    const hasPassword = parameters.password.trim().length > 0 || parameters.ownerPassword.trim().length > 0;
    const hasPermissionRestriction = (
      parameters.preventAssembly
      || parameters.preventExtractContent
      || parameters.preventExtractForAccessibility
      || parameters.preventFillInForm
      || parameters.preventModify
      || parameters.preventModifyAnnotations
      || parameters.preventPrinting
      || parameters.preventPrintingFaithful
    );

    return hasPassword || hasPermissionRestriction;
  };

  const getEndpointName = () => {
    return 'add-password';
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};
