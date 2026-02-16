import { useState, useEffect } from 'react';
import apiClient from '@app/services/apiClient';
import { AxiosError } from 'axios';

export interface FooterInfo {
  analyticsEnabled?: boolean;
  termsAndConditions?: string;
  privacyPolicy?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
}

/**
 * Hook to fetch public footer configuration data.
 * This endpoint is always accessible without authentication.
 */
export function useFooterInfo() {
  const [footerInfo, setFooterInfo] = useState<FooterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchFooterInfo = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get<FooterInfo>('/api/v1/ui-data/footer-info', {
          suppressErrorToast: true,
        } as any);
        setFooterInfo(response.data);
        setError(null);
      } catch (err) {
        const status = err instanceof AxiosError ? err.response?.status : undefined;
        if (status !== 404) {
          console.error('[useFooterInfo] Failed to fetch footer info:', err);
          setError(err as Error);
        } else {
          // Older servers may not expose this endpoint.
          setError(null);
        }
        // Set defaults on error
        setFooterInfo({
          analyticsEnabled: false,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchFooterInfo();
  }, []);

  return { footerInfo, loading, error };
}
