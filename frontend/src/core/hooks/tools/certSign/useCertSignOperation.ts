import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { CertSignParameters, defaultParameters } from '@app/hooks/tools/certSign/useCertSignParameters';

// Build form data for signing
export const buildCertSignFormData = (parameters: CertSignParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  
  // Handle sign mode
  if (parameters.signMode === 'AUTO') {
    formData.append('certType', 'SERVER');
  } else {
    formData.append('certType', parameters.certType);
    formData.append('password', parameters.password);
    if (['WINDOWS_STORE', 'MAC_KEYCHAIN', 'PKCS11'].includes(parameters.certType) && parameters.certAlias) {
      formData.append('certAlias', parameters.certAlias);
    }
    
    // Add certificate files based on type (only for manual mode)
    switch (parameters.certType) {
      case 'PEM':
        if (parameters.privateKeyFile) {
          formData.append('privateKeyFile', parameters.privateKeyFile);
        }
        if (parameters.certFile) {
          formData.append('certFile', parameters.certFile);
        }
        break;
      case 'PKCS12':
        if (parameters.p12File) {
          formData.append('p12File', parameters.p12File);
        }
        break;
      case 'PFX':
        if (parameters.p12File) {
          formData.append('p12File', parameters.p12File);
        }
        break;
      case 'JKS':
        if (parameters.jksFile) {
          formData.append('jksFile', parameters.jksFile);
        }
        break;
      case 'PKCS11':
        if (parameters.pkcs11ConfigFile) {
          formData.append('pkcs11ConfigFile', parameters.pkcs11ConfigFile);
        }
        break;
    }
  }
  
  // Add signature appearance options if enabled
  if (parameters.showSignature) {
    formData.append('showSignature', 'true');
    formData.append('reason', parameters.reason);
    formData.append('location', parameters.location);
    formData.append('name', parameters.name);
    formData.append('pageNumber', parameters.pageNumber.toString());
    formData.append('showLogo', parameters.showLogo.toString());
  }
  
  return formData;
};

// Static configuration object
export const certSignOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildCertSignFormData,
  operationType: 'certSign',
  endpoint: '/api/v1/security/cert-sign',
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useCertSignOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CertSignParameters>({
    ...certSignOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('certSign.error.failed', 'An error occurred while processing signatures.'))
  });
};
