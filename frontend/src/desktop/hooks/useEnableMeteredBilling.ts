import { useState } from 'react';
import { supabase } from '@app/auth/supabase';

/**
 * Shared hook for enabling metered (overage) billing via Supabase edge function.
 * Used by CreditExhaustedModal and InsufficientCreditsModal to avoid duplicate logic.
 *
 * @param refreshBilling - Callback to refresh billing state after success
 * @param onSuccess - Callback invoked after billing is enabled and refreshed
 * @param logPrefix - Label used in console messages for easier tracing
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
      const { data, error } = await supabase.functions.invoke('create-meter-subscription', {
        method: 'POST',
      });

      if (error) {
        throw new Error(error.message || 'Failed to enable metered billing');
      }

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
