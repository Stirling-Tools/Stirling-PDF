import { useEffect, useRef } from "react";
import { useSaaSBilling } from "@app/contexts/SaasBillingContext";
import { useSaaSMode } from "@app/hooks/useSaaSMode";
import { CREDIT_EVENTS } from "@app/constants/creditEvents";

/**
 * Desktop hook that monitors credit balance and dispatches events
 * when credits are exhausted or low.
 * Only active in SaaS mode — self-hosted users have no credit balance.
 */
export function useCreditEvents() {
  const isSaaSMode = useSaaSMode();
  const { creditBalance } = useSaaSBilling();
  const prevBalanceRef = useRef(creditBalance);

  useEffect(() => {
    const prevBalance = prevBalanceRef.current;

    // Dispatch exhausted event when credits reach 0 from positive balance.
    // Skip entirely in self-hosted mode — creditBalance defaults to 0 there.
    if (isSaaSMode && creditBalance <= 0 && prevBalance > 0) {
      window.dispatchEvent(
        new CustomEvent(CREDIT_EVENTS.EXHAUSTED, {
          detail: {
            previousBalance: prevBalance,
            currentBalance: creditBalance,
          },
        }),
      );
    }

    // Update ref for next comparison
    prevBalanceRef.current = creditBalance;
  }, [isSaaSMode, creditBalance]);
}
