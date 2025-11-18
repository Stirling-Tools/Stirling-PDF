import { useEffect, useState } from 'react';
import apiClient from '@app/services/apiClient';

interface UseLicenseInfoOptions {
  opened: boolean;
  shouldFetch: boolean;
}

export function useLicenseInfo({ opened, shouldFetch }: UseLicenseInfoOptions) {
  const [licenseUserCount, setLicenseUserCount] = useState<number | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }

    if (!shouldFetch) {
      setLicenseUserCount(null);
      return;
    }

    let cancelled = false;

    const fetchLicenseInfo = async () => {
      try {
        const response = await apiClient.get<{ totalUsers?: number }>(
          '/api/v1/proprietary/ui-data/admin-settings',
          {
            suppressErrorToast: true,
          } as any,
        );

        if (!cancelled) {
          const totalUsers = response.data?.totalUsers;
          setLicenseUserCount(typeof totalUsers === 'number' ? totalUsers : null);
        }
      } catch (error) {
        console.error('[onboarding] failed to fetch license information', error);
        if (!cancelled) {
          setLicenseUserCount(null);
        }
      }
    };

    fetchLicenseInfo();

    return () => {
      cancelled = true;
    };
  }, [opened, shouldFetch]);

  return licenseUserCount;
}

