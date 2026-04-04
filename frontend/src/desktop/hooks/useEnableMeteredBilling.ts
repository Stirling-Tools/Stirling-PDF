import { useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { authService } from '@app/services/authService';
import { STIRLING_SAAS_BACKEND_API_URL } from '@app/constants/connection';

/**
 * Shared hook for enabling metered (overage) billing via backend API.
 * Used by CreditExhaustedModal and InsufficientCreditsModal.
 */
export function useEnableMeteredBilling(
  refreshBilling: () => Promise<void>,
  onSuccess: () => void,
  logPrefix: string
): {
  enablingMetering: boolean;
  meteringError: string | null;
  handleEnableMetering: () => Promise<void>;
} {
  const [enablingMetering, setEnablingMetering] = useState(false);
  const [meteringError, setMeteringError] = useState<string | null>(null);

  const handleEnableMetering = async () => {
    console.debug(`[${logPrefix}] Enabling metered billing`);
    setEnablingMetering(true);
    setMeteringError(null);

    try {
      const token = await authService.getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await tauriFetch(
        `${STIRLING_SAAS_BACKEND_API_URL}/api/v1/billing/enable-metered`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(errorData?.error || errorData?.message || 'Failed to enable metered billing');
      }

      const data = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!data?.success) {
        throw new Error(data?.error || data?.message || 'Failed to enable metered billing');
      }

      console.debug(`[${logPrefix}] Metered billing enabled successfully`);

      await refreshBilling();
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to enable metered billing';
      console.error(`[${logPrefix}] Failed to enable metered billing:`, err);
      setMeteringError(message);
    } finally {
      setEnablingMetering(false);
    }
  };

  return { enablingMetering, meteringError, handleEnableMetering };
}
