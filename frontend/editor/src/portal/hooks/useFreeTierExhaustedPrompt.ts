import { useEffect } from "react";
import { useUI } from "@portal/contexts/UIContext";
import { FREE_TIER_EXHAUSTED_EVENT } from "@portal/services/accountLinkBlock";

/**
 * Opens the account-link dialog on the "allowance spent" pitch when the instance reports a spent
 * free grant. Mount once, alongside the dialog it opens.
 *
 * <p>The bridge is a window event rather than a call, because the reporter is the API client and has
 * no React context to reach: same shape as the cloud build's usage-limit modals.
 */
export function useFreeTierExhaustedPrompt(): void {
  const { openLinkModal } = useUI();

  useEffect(() => {
    const onExhausted = () => openLinkModal("exhausted");
    window.addEventListener(FREE_TIER_EXHAUSTED_EVENT, onExhausted);
    return () =>
      window.removeEventListener(FREE_TIER_EXHAUSTED_EVENT, onExhausted);
  }, [openLinkModal]);
}
