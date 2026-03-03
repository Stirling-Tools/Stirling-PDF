import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

// Fallback presets used only when AppConfig hasn't loaded yet.
// The real presets are served by the backend via /api/v1/config/app-config
// (field: timestampTsaPresets) — single source of truth.
export const FALLBACK_TSA_PRESETS = [
  { label: 'DigiCert', url: 'http://timestamp.digicert.com' },
  { label: 'Sectigo', url: 'http://timestamp.sectigo.com' },
  { label: 'SSL.com', url: 'http://ts.ssl.com' },
  { label: 'FreeTSA', url: 'https://freetsa.org/tsr' },
  { label: 'MeSign', url: 'http://tsa.mesign.com' },
] as const;

export interface TimestampPdfParameters extends BaseParameters {
  tsaUrl: string;
}

export const defaultParameters: TimestampPdfParameters = {
  tsaUrl: FALLBACK_TSA_PRESETS[0].url,
};

export type TimestampPdfParametersHook = BaseParametersHook<TimestampPdfParameters>;

export const useTimestampPdfParameters = (): TimestampPdfParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'timestamp-pdf',
    validateFn: (params) => {
      return params.tsaUrl.trim().length > 0;
    },
  });
};
