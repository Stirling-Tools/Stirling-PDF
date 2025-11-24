import React from 'react';
import { Stack, Text, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { PlanTier } from '@app/services/licenseService';

// Load Stripe once
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

interface PaymentStageProps {
  clientSecret: string | null;
  selectedPlan: PlanTier | null;
  onPaymentComplete: () => void;
}

export const PaymentStage: React.FC<PaymentStageProps> = ({
  clientSecret,
  selectedPlan,
  onPaymentComplete,
}) => {
  const { t } = useTranslation();

  // Show loading while creating checkout session
  if (!clientSecret || !selectedPlan) {
    return (
      <Stack align="center" justify="center" style={{ padding: '2rem 0' }}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed" mt="md">
          {t('payment.preparing', 'Preparing your checkout...')}
        </Text>
      </Stack>
    );
  }

  if (!stripePromise) {
    return (
      <Text size="sm" c="red">
        Stripe is not configured properly.
      </Text>
    );
  }

  return (
    <Stack gap="md">

      {/* Stripe Embedded Checkout */}
      <EmbeddedCheckoutProvider
        key={clientSecret}
        stripe={stripePromise}
        options={{
          clientSecret: clientSecret,
          onComplete: onPaymentComplete,
        }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </Stack>
  );
};
