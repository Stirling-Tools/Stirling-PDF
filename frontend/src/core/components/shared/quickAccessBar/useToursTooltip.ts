import { useCallback, useEffect, useRef, useState } from 'react';
import { TOUR_STATE_EVENT, type TourStatePayload } from '@app/constants/events';
import { hasSeenStep, hasShownToursTooltip, markToursTooltipShown } from '@app/components/onboarding/orchestrator/onboardingStorage';

export interface ToursTooltipState {
  tooltipOpen: boolean | undefined;
  manualCloseOnly: boolean;
  showCloseButton: boolean;
  toursMenuOpen: boolean;
  setToursMenuOpen: (open: boolean) => void;
  handleTooltipOpenChange: (next: boolean) => void;
}

/**
 * Encapsulates all the logic for the tours tooltip:
 * - Shows automatically after onboarding/tour completes (once per user)
 * - Hides while the tours menu is open
 * - After dismissal, reverts to hover-only tooltip
 */
export function useToursTooltip(): ToursTooltipState {
  const [showToursTooltip, setShowToursTooltip] = useState(false);
  const [toursMenuOpen, setToursMenuOpen] = useState(false);
  const tourWasOpenRef = useRef(false);

  // Auto-show when a tour ends (fires once per user)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleTourStateChange = (event: Event) => {
      const { detail } = event as CustomEvent<TourStatePayload>;
      const wasOpen = tourWasOpenRef.current;
      tourWasOpenRef.current = detail.isOpen;

      if (wasOpen && !detail.isOpen && !hasShownToursTooltip()) {
        setShowToursTooltip(true);
      }
    };

    window.addEventListener(TOUR_STATE_EVENT, handleTourStateChange);
    return () => window.removeEventListener(TOUR_STATE_EVENT, handleTourStateChange);
  }, []);

  // Show once after onboarding is complete
  useEffect(() => {
    const onboardingComplete = hasSeenStep('welcome');
    if (onboardingComplete && !hasShownToursTooltip()) {
      setShowToursTooltip(true);
    }
  }, []);

  const handleDismissToursTooltip = useCallback(() => {
    markToursTooltipShown();
    setShowToursTooltip(false);
  }, []);

  const hasBeenDismissed = hasShownToursTooltip();

  const handleTooltipOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (!hasBeenDismissed) {
          handleDismissToursTooltip();
        }
      } else if (!hasBeenDismissed && !toursMenuOpen) {
        setShowToursTooltip(true);
      }
    },
    [hasBeenDismissed, toursMenuOpen, handleDismissToursTooltip]
  );

  const tooltipOpen = toursMenuOpen ? false : hasBeenDismissed ? undefined : showToursTooltip;

  return {
    tooltipOpen,
    manualCloseOnly: !hasBeenDismissed,
    showCloseButton: !hasBeenDismissed,
    toursMenuOpen,
    setToursMenuOpen,
    handleTooltipOpenChange,
  };
}

