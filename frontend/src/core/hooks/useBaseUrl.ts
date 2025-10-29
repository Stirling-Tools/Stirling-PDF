import { useAppConfig } from '@app/contexts/AppConfigContext';

export const useBaseUrl = (): string => {
  const { config } = useAppConfig();
  return config?.baseUrl || 'https://demo.stirlingpdf.com';
};
