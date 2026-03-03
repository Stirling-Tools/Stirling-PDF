import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export const TSA_PRESETS = [
  { label: 'DigiCert', url: 'http://timestamp.digicert.com' },
  { label: 'Sectigo', url: 'http://timestamp.sectigo.com' },
  { label: 'SSL.com', url: 'http://ts.ssl.com' },
  { label: 'Entrust', url: 'http://timestamp.entrust.net/TSS/RFC3161sha2TS' },
  { label: 'FreeTSA', url: 'http://freetsa.org/tsr' },
] as const;

export const CUSTOM_TSA_VALUE = 'custom';

export interface TimestampPdfParameters extends BaseParameters {
  tsaUrl: string;
  customTsaUrl: string;
}

export const defaultParameters: TimestampPdfParameters = {
  tsaUrl: TSA_PRESETS[0].url,
  customTsaUrl: '',
};

export type TimestampPdfParametersHook = BaseParametersHook<TimestampPdfParameters>;

export const useTimestampPdfParameters = (): TimestampPdfParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'timestamp-pdf',
    validateFn: (params) => {
      const url = params.tsaUrl === CUSTOM_TSA_VALUE ? params.customTsaUrl : params.tsaUrl;
      return url.trim().length > 0;
    },
  });
};
