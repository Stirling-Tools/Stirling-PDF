import { useEffect, useRef } from 'react';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { CREDIT_EVENTS } from '@app/constants/creditEvents';

/**
 * Desktop hook that monitors credit balance and dispatches events
 * when credits are exhausted or low
 */
export function useCreditEvents() {
  const { creditBalance } = useSaaSBilling();
  const prevBalanceRef = useRef(creditBalance);

  useEffect(() => {
    const prevBalance = prevBalanceRef.current;

    // Dispatch exhausted event when credits reach 0 from positive balance
    if (creditBalance <= 0 && prevBalance > 0) {
      window.dispatchEvent(
        new CustomEvent(CREDIT_EVENTS.EXHAUSTED, {
          detail: { previousBalance: prevBalance, currentBalance: creditBalance },
        })
      );
    }

    // Update ref for next comparison
    prevBalanceRef.current = creditBalance;
  }, [creditBalance]);
}
