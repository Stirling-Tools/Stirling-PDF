import { useEffect, useState } from "react";
import { useSaaSBilling } from "@app/contexts/SaasBillingContext";
import { useSaaSMode } from "@app/hooks/useSaaSMode";
import { BILLING_CONFIG } from "@app/config/billing";
import { CreditExhaustedModal } from "@app/components/shared/modals/CreditExhaustedModal";
import { InsufficientCreditsModal } from "@app/components/shared/modals/InsufficientCreditsModal";
import { useCreditEvents } from "@app/hooks/useCreditEvents";
import { CREDIT_EVENTS } from "@app/constants/creditEvents";

/**
 * Desktop Credit Modal Bootstrap
 * Listens to credit events and shows appropriate modals
 * Orchestrates credit exhausted and insufficient credits modals
 */
export function CreditModalBootstrap() {
  const [exhaustedOpen, setExhaustedOpen] = useState(false);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientDetails, setInsufficientDetails] = useState<{
    toolId?: string;
    requiredCredits?: number;
  }>({});

  const isSaaSMode = useSaaSMode();
  const {
    creditBalance,
    isManagedTeamMember,
    lastFetchTime,
    plansLastFetchTime,
    refreshPlans,
  } = useSaaSBilling();

  // Preload plan pricing when billing confirms credits are low.
  // Fires once: only when in SaaS mode, billing has loaded (lastFetchTime set) and plans haven't been
  // fetched yet (plansLastFetchTime null). This way the modal shows real prices instantly.
  useEffect(() => {
    if (
      isSaaSMode &&
      lastFetchTime !== null &&
      plansLastFetchTime === null &&
      creditBalance < BILLING_CONFIG.PLAN_PRICING_PRELOAD_THRESHOLD &&
      !isManagedTeamMember
    ) {
      refreshPlans();
    }
  }, [
    isSaaSMode,
    lastFetchTime,
    plansLastFetchTime,
    creditBalance,
    isManagedTeamMember,
    refreshPlans,
  ]);

  // Monitor credit balance and dispatch events
  useCreditEvents();

  useEffect(() => {
    const handleExhausted = () => {
      // Don't show modal for managed team members
      if (isManagedTeamMember) {
        return;
      }
      setExhaustedOpen(true);
    };

    const handleInsufficient = (e: Event) => {
      // Don't show modal for managed team members
      if (isManagedTeamMember) {
        return;
      }
      const customEvent = e as CustomEvent;
      setInsufficientDetails({
        toolId: customEvent.detail?.operationType,
        requiredCredits: customEvent.detail?.requiredCredits,
      });
      // Show the plans banner (CreditExhaustedModal) instead of the simpler
      // InsufficientCreditsModal — same experience as clicking the upgrade button.
      setExhaustedOpen(true);
    };

    window.addEventListener(CREDIT_EVENTS.EXHAUSTED, handleExhausted);
    window.addEventListener(CREDIT_EVENTS.INSUFFICIENT, handleInsufficient);

    return () => {
      window.removeEventListener(CREDIT_EVENTS.EXHAUSTED, handleExhausted);
      window.removeEventListener(
        CREDIT_EVENTS.INSUFFICIENT,
        handleInsufficient,
      );
    };
  }, [isManagedTeamMember, creditBalance]);

  return (
    <>
      <CreditExhaustedModal
        opened={exhaustedOpen && !insufficientOpen}
        onClose={() => setExhaustedOpen(false)}
      />
      <InsufficientCreditsModal
        opened={insufficientOpen}
        onClose={() => setInsufficientOpen(false)}
        toolId={insufficientDetails.toolId}
        requiredCredits={insufficientDetails.requiredCredits}
      />
    </>
  );
}
