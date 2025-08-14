import { useAppConfig } from '../hooks/useAppConfig';

// Get base URL from app config with fallback
export const getBaseUrl = (): string => {
  const { config } = useAppConfig();
  return config?.baseUrl || 'https://demo.stirlingpdf.com';
};