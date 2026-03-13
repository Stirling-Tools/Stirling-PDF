import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { useSaaSMode } from '@app/hooks/useSaaSMode';
import { getToolCreditCost } from '@app/utils/creditCosts';
import { CREDIT_EVENTS } from '@app/constants/creditEvents';
import type { ToolId } from '@app/types/toolId';

/**
 * Desktop implementation of credit checking for cloud operations.
 * Hooks are called at render time; the returned checkCredits callback
 * closes over the billing state so it can be called safely inside
 * async operation handlers.
 *
 * Returns null when the operation is allowed, or an error message string
 * when it should be blocked.
 */
export function useCreditCheck(operationType?: string) {
  const billing = useSaaSBilling();
  const isSaaSMode = useSaaSMode();
  const { t } = useTranslation();

  const checkCredits = useCallback(async (): Promise<string | null> => {
    if (!isSaaSMode) return null; // Credits only apply in SaaS mode, not self-hosted
    if (!billing) return null;

    const { creditBalance, loading } = billing;
    const requiredCredits = getToolCreditCost(operationType as ToolId);

    if (!loading && creditBalance < requiredCredits) {
      window.dispatchEvent(new CustomEvent(CREDIT_EVENTS.INSUFFICIENT, {
        detail: {
          operationType,
          requiredCredits,
          currentBalance: creditBalance,
        },
      }));

      return t(
        'credits.insufficient.brief',
        'Insufficient credits. You need {{required}} credits but have {{current}}.',
        { required: requiredCredits, current: creditBalance },
      );
    }

    return null;
  }, [billing, isSaaSMode, operationType, t]);

  return { checkCredits };
}
