import { useState, useCallback, useRef } from 'react';
import { PlanTierGroup } from '@app/services/licenseService';
import { CheckoutState, PollingStatus, CheckoutStage } from '@app/components/shared/stripeCheckout/types/checkout';

/**
 * Centralized state management hook for checkout flow
 */
export const useCheckoutState = (planGroup: PlanTierGroup) => {
  const [state, setState] = useState<CheckoutState>({
    currentStage: 'email',
    loading: false
  });
  const [stageHistory, setStageHistory] = useState<CheckoutStage[]>([]);
  const [emailInput, setEmailInput] = useState<string>('');
  const [emailError, setEmailError] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>(
    planGroup.yearly ? 'yearly' : 'monthly'
  );
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [currentLicenseKey, setCurrentLicenseKey] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>('idle');

  // Refs for polling cleanup
  const isMountedRef = useRef(true);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get the selected plan based on period
  const selectedPlan = selectedPeriod === 'yearly'
    ? planGroup.yearly
    : planGroup.monthly;

  const resetState = useCallback(() => {
    setState({
      currentStage: 'email',
      loading: false,
      clientSecret: undefined,
      sessionId: undefined,
      error: undefined
    });
    setStageHistory([]);
    setEmailInput('');
    setEmailError('');
    setPollingStatus('idle');
    setCurrentLicenseKey(null);
    setLicenseKey(null);
    setSelectedPeriod(planGroup.yearly ? 'yearly' : 'monthly');
  }, [planGroup]);

  return {
    // State
    state,
    setState,
    stageHistory,
    setStageHistory,
    emailInput,
    setEmailInput,
    emailError,
    setEmailError,
    selectedPeriod,
    setSelectedPeriod,
    installationId,
    setInstallationId,
    currentLicenseKey,
    setCurrentLicenseKey,
    licenseKey,
    setLicenseKey,
    pollingStatus,
    setPollingStatus,
    // Refs
    isMountedRef,
    pollingTimeoutRef,
    // Computed
    selectedPlan,
    // Actions
    resetState,
  };
};
