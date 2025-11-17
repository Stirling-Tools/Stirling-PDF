import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { usePlans } from '@app/hooks/usePlans';
import licenseService, { PlanTierGroup, LicenseInfo, mapLicenseToTier } from '@app/services/licenseService';
import StripeCheckout from '@app/components/shared/StripeCheckout';
import { userManagementService } from '@app/services/userManagementService';

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
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlanGroup, setSelectedPlanGroup] = useState<PlanTierGroup | null>(null);
  const [minimumSeats, setMinimumSeats] = useState<number>(1);
  const [currentCurrency, setCurrentCurrency] = useState(defaultCurrency);
  const [currentOptions, setCurrentOptions] = useState<CheckoutOptions>({});

  // Load plans with current currency
  const { plans, refetch: refetchPlans } = usePlans(currentCurrency);

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
