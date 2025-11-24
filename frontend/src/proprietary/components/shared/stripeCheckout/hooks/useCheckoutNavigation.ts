import { useCallback } from 'react';
import { CheckoutState, CheckoutStage } from '@app/components/shared/stripeCheckout/types/checkout';

/**
 * Stage navigation and history management hook
 */
export const useCheckoutNavigation = (
  state: CheckoutState,
  setState: React.Dispatch<React.SetStateAction<CheckoutState>>,
  stageHistory: CheckoutStage[],
  setStageHistory: React.Dispatch<React.SetStateAction<CheckoutStage[]>>
) => {
  const goToStage = useCallback((nextStage: CheckoutStage) => {
    setStageHistory(prev => [...prev, state.currentStage]);
    setState(prev => ({ ...prev, currentStage: nextStage }));
  }, [state.currentStage, setState, setStageHistory]);

  const goBack = useCallback(() => {
    if (stageHistory.length > 0) {
      const previousStage = stageHistory[stageHistory.length - 1];
      setStageHistory(prev => prev.slice(0, -1));

      // Reset payment state when going back from payment stage
      if (state.currentStage === 'payment') {
        setState(prev => ({
          ...prev,
          currentStage: previousStage,
          clientSecret: undefined,
          loading: false
        }));
      } else {
        setState(prev => ({ ...prev, currentStage: previousStage }));
      }
    }
  }, [stageHistory, state.currentStage, setState, setStageHistory]);

  return { goToStage, goBack };
};
