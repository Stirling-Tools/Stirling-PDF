import { useCallback } from 'react';
import { pollLicenseKeyWithBackoff, activateLicenseKey } from '@app/utils/licenseCheckoutUtils';
import { PollingStatus } from '../types/checkout';

/**
 * License key polling and activation logic hook
 */
export const useLicensePolling = (
  isMountedRef: React.RefObject<boolean>,
  setPollingStatus: React.Dispatch<React.SetStateAction<PollingStatus>>,
  setLicenseKey: React.Dispatch<React.SetStateAction<string | null>>,
  onLicenseActivated?: (licenseInfo: {licenseType: string; enabled: boolean; maxUsers: number; hasKey: boolean}) => void
) => {
  const pollForLicenseKey = useCallback(async (installId: string) => {
    // Use shared polling utility
    const result = await pollLicenseKeyWithBackoff(installId, {
      isMounted: () => isMountedRef.current!,
      onStatusChange: setPollingStatus,
    });

    if (result.success && result.licenseKey) {
      setLicenseKey(result.licenseKey);

      // Activate the license key
      const activation = await activateLicenseKey(result.licenseKey, {
        isMounted: () => isMountedRef.current!,
        onActivated: onLicenseActivated,
      });

      if (!activation.success) {
        console.error('Failed to activate license key:', activation.error);
      }
    } else if (result.timedOut) {
      console.warn('License key polling timed out');
    } else if (result.error) {
      console.error('License key polling failed:', result.error);
    }
  }, [isMountedRef, setPollingStatus, setLicenseKey, onLicenseActivated]);

  return { pollForLicenseKey };
};
