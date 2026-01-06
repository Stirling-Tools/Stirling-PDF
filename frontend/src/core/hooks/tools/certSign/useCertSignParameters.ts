import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface CertSignParameters extends BaseParameters {
  // Sign mode selection
  signMode: 'MANUAL' | 'AUTO';
  // Certificate signing options (only for manual mode)
  certType: '' | 'PEM' | 'PKCS12' | 'PFX' | 'JKS' | 'WINDOWS_STORE' | 'MAC_KEYCHAIN' | 'PKCS11';
  privateKeyFile?: File;
  certFile?: File;
  p12File?: File;
  jksFile?: File;
  password: string;
  certAlias: string;
  pkcs11ConfigFile?: File;
  
  // Signature appearance options
  showSignature: boolean;
  reason: string;
  location: string;
  name: string;
  pageNumber: number;
  showLogo: boolean;
}

export const defaultParameters: CertSignParameters = {
  signMode: 'MANUAL',
  certType: '',
  password: '',
  certAlias: '',
  showSignature: false,
  reason: '',
  location: '',
  name: '',
  pageNumber: 1,
  showLogo: true,
};

export type CertSignParametersHook = BaseParametersHook<CertSignParameters>;

export const useCertSignParameters = (): CertSignParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'cert-sign',
    validateFn: (params) => {
      // Auto mode (server certificate) - no additional validation needed
      if (params.signMode === 'AUTO') {
        return true;
      }
      
      // Manual mode - requires certificate type and files
      if (!params.certType) {
        return false;
      }
      
      // Check for required files based on cert type
      switch (params.certType) {
        case 'PEM':
          return !!(params.privateKeyFile && params.certFile);
        case 'PKCS12':
        case 'PFX':
          return !!params.p12File;
        case 'JKS':
          return !!params.jksFile;
        case 'WINDOWS_STORE':
        case 'MAC_KEYCHAIN':
          return !!params.certAlias;
        case 'PKCS11':
          return !!(params.certAlias && params.pkcs11ConfigFile);
        default:
          return false;
      }
    },
  });
};
