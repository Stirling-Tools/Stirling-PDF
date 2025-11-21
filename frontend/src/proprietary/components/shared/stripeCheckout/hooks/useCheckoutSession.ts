import { useCallback } from 'react';
import licenseService, { PlanTier } from '@app/services/licenseService';
import { resyncExistingLicense } from '@app/utils/licenseCheckoutUtils';
import { CheckoutState, PollingStatus } from '../types/checkout';

/**
 * Checkout session creation and payment handling hook
 */
export const useCheckoutSession = (
  selectedPlan: PlanTier | null,
  state: CheckoutState,
  setState: React.Dispatch<React.SetStateAction<CheckoutState>>,
  installationId: string | null,
  setInstallationId: React.Dispatch<React.SetStateAction<string | null>>,
  currentLicenseKey: string | null,
  setCurrentLicenseKey: React.Dispatch<React.SetStateAction<string | null>>,
  setPollingStatus: React.Dispatch<React.SetStateAction<PollingStatus>>,
  minimumSeats: number,
  pollForLicenseKey: (installId: string) => Promise<void>,
  onSuccess?: (sessionId: string) => void,
  onError?: (error: string) => void,
  onLicenseActivated?: (licenseInfo: {licenseType: string; enabled: boolean; maxUsers: number; hasKey: boolean}) => void
) => {
  const createCheckoutSession = useCallback(async () => {
    if (!selectedPlan) {
      setState({
        currentStage: 'error',
        error: 'Selected plan period is not available',
        loading: false,
      });
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true }));

      // Fetch installation ID from backend
      let fetchedInstallationId = installationId;
      if (!fetchedInstallationId) {
        fetchedInstallationId = await licenseService.getInstallationId();
        setInstallationId(fetchedInstallationId);
      }

      // Fetch current license key for upgrades
      let existingLicenseKey: string | undefined;
      try {
        const licenseInfo = await licenseService.getLicenseInfo();
        if (licenseInfo && licenseInfo.licenseKey) {
          existingLicenseKey = licenseInfo.licenseKey;
          setCurrentLicenseKey(existingLicenseKey);
          console.log('Found existing license for upgrade');
        }
      } catch (error) {
        console.warn('Could not fetch license info, proceeding as new license:', error);
      }

      const response = await licenseService.createCheckoutSession({
        lookup_key: selectedPlan.lookupKey,
        installation_id: fetchedInstallationId,
        current_license_key: existingLicenseKey,
        requires_seats: selectedPlan.requiresSeats,
        seat_count: Math.max(1, Math.min(minimumSeats || 1, 10000)),
        email: state.email, // Pass collected email from Stage 1
      });

      // Check if we got a redirect URL (hosted checkout for HTTP)
      if (response.url) {
        console.log('Redirecting to Stripe hosted checkout:', response.url);
        // Redirect to Stripe's hosted checkout page
        window.location.href = response.url;
        return;
      }

      // Otherwise, use embedded checkout (HTTPS)
      setState(prev => ({
        ...prev,
        clientSecret: response.clientSecret,
        sessionId: response.sessionId,
        loading: false,
      }));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create checkout session';
      setState({
        currentStage: 'error',
        error: errorMessage,
        loading: false,
      });
      onError?.(errorMessage);
    }
  }, [
    selectedPlan,
    state.email,
    installationId,
    minimumSeats,
    setState,
    setInstallationId,
    setCurrentLicenseKey,
    onError
  ]);

  const handlePaymentComplete = useCallback(async () => {
    // Preserve state when changing stage
    setState(prev => ({ ...prev, currentStage: 'success' }));

    // Check if this is an upgrade (existing license key) or new plan
    if (currentLicenseKey) {
      // UPGRADE FLOW: Resync existing license with Keygen
      console.log('Upgrade detected - resyncing existing license with Keygen');
      setPollingStatus('polling');

      const activation = await resyncExistingLicense({
        isMounted: () => true, // Modal is open, no need to check
        onActivated: onLicenseActivated,
      });

      if (activation.success) {
        console.log(`License upgraded successfully: ${activation.licenseType}`);
        setPollingStatus('ready');
      } else {
        console.error('Failed to sync upgraded license:', activation.error);
        setPollingStatus('timeout');
      }

      // Notify parent (don't wait - upgrade is complete)
      onSuccess?.(state.sessionId || '');
    } else {
      // NEW PLAN FLOW: Poll for new license key
      console.log('New subscription - polling for license key');

      if (installationId) {
        pollForLicenseKey(installationId).finally(() => {
          // Only notify parent after polling completes or times out
          onSuccess?.(state.sessionId || '');
        });
      } else {
        // No installation ID, notify immediately
        onSuccess?.(state.sessionId || '');
      }
    }
  }, [
    currentLicenseKey,
    installationId,
    state.sessionId,
    setState,
    setPollingStatus,
    pollForLicenseKey,
    onSuccess,
    onLicenseActivated
  ]);

  return {
    createCheckoutSession,
    handlePaymentComplete,
  };
};
