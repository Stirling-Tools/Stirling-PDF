import { useEffect, useState } from 'react';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';
import { CreditExhaustedModal } from '@app/components/shared/modals/CreditExhaustedModal';
import { InsufficientCreditsModal } from '@app/components/shared/modals/InsufficientCreditsModal';
import { useCreditEvents } from '@app/hooks/useCreditEvents';
import { CREDIT_EVENTS } from '@app/constants/creditEvents';

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

  const { isManagedTeamMember } = useSaaSTeam();
  const { creditBalance } = useSaaSBilling();

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

    const handleLow = () => {
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
      setInsufficientOpen(true);
    };

    window.addEventListener(CREDIT_EVENTS.EXHAUSTED, handleExhausted);
    window.addEventListener(CREDIT_EVENTS.LOW, handleLow);
    window.addEventListener(CREDIT_EVENTS.INSUFFICIENT, handleInsufficient);

    return () => {
      window.removeEventListener(CREDIT_EVENTS.EXHAUSTED, handleExhausted);
      window.removeEventListener(CREDIT_EVENTS.LOW, handleLow);
      window.removeEventListener(CREDIT_EVENTS.INSUFFICIENT, handleInsufficient);
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
