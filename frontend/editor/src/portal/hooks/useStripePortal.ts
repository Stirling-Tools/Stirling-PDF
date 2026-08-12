import { useCallback, useState } from "react";
import type { Wallet } from "@portal/api/billing";
import { createPortalSession } from "@portal/billing/stripe";

/**
 * Opens the Stripe customer portal for the wallet's team in a new tab. Card,
 * invoice, and cancellation changes all live in Stripe's hosted portal — both
 * the header "Manage Payment" action and the payment-method card's "Update"
 * button route through here.
 */
export function useStripePortal(wallet: Wallet | null) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    const teamId = wallet?.teamId;
    if (teamId == null) return;
    setOpening(true);
    setError(null);
    try {
      const url = await createPortalSession({
        teamId,
        returnUrl: window.location.href,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  }, [wallet?.teamId]);

  return { open, opening, error };
}
