import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface ManageSignaturesParameters extends BaseParameters {
  // Certificate signing options
  certType: '' | 'PEM' | 'PKCS12' | 'JKS';
  privateKeyFile?: File;
  certFile?: File;
  p12File?: File;
  jksFile?: File;
  password: string;
  
  // Signature appearance options
  showSignature: boolean;
  reason: string;
  location: string;
  name: string;
  pageNumber: number;
  showLogo: boolean;
}

export const defaultParameters: ManageSignaturesParameters = {
  certType: '',
  password: '',
  showSignature: false,
  reason: '',
  location: '',
  name: '',
  pageNumber: 1,
  showLogo: true,
};

export type ManageSignaturesParametersHook = BaseParametersHook<ManageSignaturesParameters>;

export const useManageSignaturesParameters = (): ManageSignaturesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'manage-signatures',
    validateFn: (params) => {
      // Requires certificate type
      if (!params.certType) {
        return false;
      }
      
      // Check for required files based on cert type
      switch (params.certType) {
        case 'PEM':
          return !!(params.privateKeyFile && params.certFile);
        case 'PKCS12':
          return !!params.p12File;
        case 'JKS':
          return !!params.jksFile;
        default:
          return false;
      }
    },
  });
};