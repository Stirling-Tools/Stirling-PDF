import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { SaaSStripeCheckout } from '@app/components/shared/billing/SaaSStripeCheckout';
import { useSaaSBilling } from '@app/contexts/SaasBillingContext';

interface SaaSCheckoutContextType {
  opened: boolean;
  selectedPlan: string | null;
  openCheckout: (planId: string) => void;
  closeCheckout: () => void;
}

const SaaSCheckoutContext = createContext<SaaSCheckoutContextType | undefined>(undefined);

export const useSaaSCheckout = () => {
  const context = useContext(SaaSCheckoutContext);
  if (!context) {
    throw new Error('useSaaSCheckout must be used within SaaSCheckoutProvider');
  }
  return context;
};

interface SaaSCheckoutProviderProps {
  children: ReactNode;
}

export const SaaSCheckoutProvider: React.FC<SaaSCheckoutProviderProps> = ({
  children
}) => {
  const [opened, setOpened] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Access billing context for auto-refresh after checkout
  const { refreshBilling } = useSaaSBilling();

  const openCheckout = (planId: string) => {
    setSelectedPlan(planId);
    setOpened(true);
  };

  const closeCheckout = () => {
    setOpened(false);
    // Don't reset selectedPlan immediately to allow for cleanup
    setTimeout(() => setSelectedPlan(null), 300);
  };

  // Internal success handler - automatically refreshes billing context
  const handleCheckoutSuccess = useCallback(async () => {
    // Wait for webhooks to process (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      await refreshBilling();
    } catch (error) {
      console.error('[SaaSCheckoutContext] Failed to refresh billing after checkout:', error);
    }
  }, [refreshBilling]);

  return (
    <SaaSCheckoutContext.Provider
      value={{
        opened,
        selectedPlan,
        openCheckout,
        closeCheckout,
      }}
    >
      {children}
      <SaaSStripeCheckout
        opened={opened}
        onClose={closeCheckout}
        planId={selectedPlan}
        onSuccess={handleCheckoutSuccess}
      />
    </SaaSCheckoutContext.Provider>
  );
};
