import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup, LicenseInfo, mapLicenseToTier } from '@app/services/licenseService';
import StripeCheckout from '@app/components/shared/StripeCheckout';
import { userManagementService } from '@app/services/userManagementService';
import { alert } from '@app/components/toast';
import { pollLicenseKeyWithBackoff, activateLicenseKey, resyncExistingLicense } from '@app/utils/licenseCheckoutUtils';

export interface CheckoutOptions {
  minimumSeats?: number;      // Override calculated seats for enterprise
  currency?: string;          // Optional currency override (defaults to 'gbp')
  onSuccess?: (sessionId: string) => void;  // Callback after successful payment
  onError?: (error: string) => void;  // Callback on error
}

interface CheckoutContextValue {
  openCheckout: (
    tier: 'server' | 'enterprise',
    options?: CheckoutOptions
  ) => Promise<void>;
  closeCheckout: () => void;
  isOpen: boolean;
  isLoading: boolean;
}

const CheckoutContext = createContext<CheckoutContextValue | undefined>(undefined);

interface CheckoutProviderProps {
  children: ReactNode;
  defaultCurrency?: string;
}

export const CheckoutProvider: React.FC<CheckoutProviderProps> = ({
  children,
  defaultCurrency = 'gbp'
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlanGroup, setSelectedPlanGroup] = useState<PlanTierGroup | null>(null);
  const [minimumSeats, setMinimumSeats] = useState<number>(1);
  const [currentCurrency, setCurrentCurrency] = useState(defaultCurrency);
  const [currentOptions, setCurrentOptions] = useState<CheckoutOptions>({});

  // Load plans with current currency
  const { plans, refetch: refetchPlans } = usePlans(currentCurrency);

  // Handle return from hosted Stripe checkout
  useEffect(() => {
    const handleCheckoutReturn = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get('payment_status');
      const sessionId = urlParams.get('session_id');

      if (paymentStatus === 'success' && sessionId) {
        console.log('Payment successful via hosted checkout:', sessionId);

        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);

        // Fetch current license info to determine upgrade vs new
        let licenseInfo: LicenseInfo | null = null;
        try {
          licenseInfo = await licenseService.getLicenseInfo();
        } catch (err) {
          console.warn('Could not fetch license info:', err);
        }

        // Check if this is an upgrade or new subscription
        if (licenseInfo?.licenseKey) {
          // UPGRADE: Resync existing license with Keygen
          console.log('Upgrade detected - resyncing existing license');

          const activation = await resyncExistingLicense();

          if (activation.success) {
            alert({
              alertType: 'success',
              title: t('payment.upgradeSuccess'),
            });
            refetchPlans(); // Refresh plans to show updated subscription
          } else {
            console.error('Failed to sync license after upgrade:', activation.error);
            alert({
              alertType: 'error',
              title: t('payment.syncError'),
            });
          }
        } else {
          // NEW SUBSCRIPTION: Poll for license key
          console.log('New subscription - polling for license key');
          alert({
            alertType: 'success',
            title: t('payment.paymentSuccess'),
          });

          try {
            const installationId = await licenseService.getInstallationId();
            console.log('Polling for license key with installation ID:', installationId);

            // Use shared polling utility
            const result = await pollLicenseKeyWithBackoff(installationId);

            if (result.success && result.licenseKey) {
              // Activate the license key
              const activation = await activateLicenseKey(result.licenseKey);

              if (activation.success) {
                console.log(`License key activated: ${activation.licenseType}`);
                alert({
                  alertType: 'success',
                  title: t('payment.licenseActivated'),
                });
                refetchPlans(); // Refresh plans to show updated subscription
              } else {
                console.error('Failed to save license key:', activation.error);
                alert({
                  alertType: 'error',
                  title: t('payment.licenseSaveError'),
                });
              }
            } else if (result.timedOut) {
              console.warn('License key polling timed out');
              alert({
                alertType: 'warning',
                title: t('payment.licenseDelayed'),
              });
            } else {
              console.error('License key polling failed:', result.error);
              alert({
                alertType: 'error',
                title: t('payment.licensePollingError'),
              });
            }
          } catch (error) {
            console.error('Failed to poll for license key:', error);
            alert({
              alertType: 'error',
              title: t('payment.licenseRetrievalError'),
            });
          }
        }
      } else if (paymentStatus === 'canceled') {
        console.log('Payment canceled by user');

        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);

        alert({
          alertType: 'warning',
          title: t('payment.paymentCanceled'),
        });
      }
    };

    handleCheckoutReturn();
  }, [t, refetchPlans]);

  const openCheckout = useCallback(
    async (tier: 'server' | 'enterprise', options: CheckoutOptions = {}) => {
      try {
        setIsLoading(true);

        // Update currency if provided
        const currency = options.currency || currentCurrency;
        if (currency !== currentCurrency) {
          setCurrentCurrency(currency);
          // Plans will reload automatically via usePlans
        }

        // Fetch license info and user data for seat calculations
        let licenseInfo: LicenseInfo | null = null;
        let totalUsers = 0;

        try {
          const [licenseData, userData] = await Promise.all([
            licenseService.getLicenseInfo(),
            userManagementService.getUsers()
          ]);

          licenseInfo = licenseData;
          totalUsers = userData.totalUsers || 0;
        } catch (err) {
          console.warn('Could not fetch license/user info, proceeding with defaults:', err);
        }

        // Calculate minimum seats for enterprise upgrades
        let calculatedMinSeats = options.minimumSeats || 1;

        if (tier === 'enterprise' && !options.minimumSeats) {
          const currentTier = mapLicenseToTier(licenseInfo);

          if (currentTier === 'server' || currentTier === 'free') {
            // Upgrading from Server (unlimited) to Enterprise (per-seat)
            // Use current total user count as minimum
            calculatedMinSeats = Math.max(totalUsers, 1);
            console.log(`Setting minimum seats from server user count: ${calculatedMinSeats}`);
          } else if (currentTier === 'enterprise') {
            // Upgrading within Enterprise (e.g., monthly to yearly)
            // Use current licensed seat count as minimum
            calculatedMinSeats = Math.max(licenseInfo?.maxUsers || 1, 1);
            console.log(`Setting minimum seats from current license: ${calculatedMinSeats}`);
          }
        }

        // Find the plan group for the requested tier
        const planGroups = licenseService.groupPlansByTier(plans);
        const planGroup = planGroups.find(pg => pg.tier === tier);

        if (!planGroup) {
          throw new Error(`No ${tier} plan available`);
        }

        // Store options for callbacks
        setCurrentOptions(options);
        setMinimumSeats(calculatedMinSeats);
        setSelectedPlanGroup(planGroup);
        setIsOpen(true);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to open checkout';
        console.error('Error opening checkout:', errorMessage);
        options.onError?.(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [currentCurrency, plans]
  );

  const closeCheckout = useCallback(() => {
    setIsOpen(false);
    setSelectedPlanGroup(null);
    setCurrentOptions({});

    // Refetch plans after modal closes to update subscription display
    refetchPlans();
  }, [refetchPlans]);

  const handlePaymentSuccess = useCallback(
    (sessionId: string) => {
      console.log('Payment successful, session:', sessionId);
      currentOptions.onSuccess?.(sessionId);
      // Don't close modal - let user view license key and close manually
    },
    [currentOptions]
  );

  const handlePaymentError = useCallback(
    (error: string) => {
      console.error('Payment error:', error);
      currentOptions.onError?.(error);
    },
    [currentOptions]
  );

  const handleLicenseActivated = useCallback((licenseInfo: {
    licenseType: string;
    enabled: boolean;
    maxUsers: number;
    hasKey: boolean;
  }) => {
    console.log('License activated:', licenseInfo);
    // Could expose this via context if needed
  }, []);

  const contextValue: CheckoutContextValue = {
    openCheckout,
    closeCheckout,
    isOpen,
    isLoading,
  };

  return (
    <CheckoutContext.Provider value={contextValue}>
      {children}

      {/* Global Checkout Modal */}
      {selectedPlanGroup && (
        <StripeCheckout
          opened={isOpen}
          onClose={closeCheckout}
          planGroup={selectedPlanGroup}
          minimumSeats={minimumSeats}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          onLicenseActivated={handleLicenseActivated}
        />
      )}
    </CheckoutContext.Provider>
  );
};

export const useCheckout = (): CheckoutContextValue => {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckout must be used within CheckoutProvider');
  }
  return context;
};
