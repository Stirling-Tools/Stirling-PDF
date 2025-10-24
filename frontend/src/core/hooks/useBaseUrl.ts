import { useAppConfig } from './useAppConfig';

export const useBaseUrl = (): string => {
  const { config } = useAppConfig();
  return config?.baseUrl || 'https://demo.stirlingpdf.com';
};
