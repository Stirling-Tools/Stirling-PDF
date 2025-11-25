import React from 'react';
import { Stack, Text, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { PlanTier } from '@app/services/licenseService';

// Load Stripe once
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_live_51Q56W2P9mY5IAnSnp3kcxG50uyFMLuhM4fFs774DAP3t88KmlwUrUo31CecpnAZ9FHsNp8xJyOnYNYNVVP6z4oi500q5sFYPEp';
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
    // This should only happen if embedded mode was attempted without key
    // Hosted checkout should have redirected before reaching this component
    return (
      <Stack align="center" gap="md" style={{ padding: '2rem 0' }}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed" mt="md">
          {t('payment.redirecting', 'Redirecting to secure checkout...')}
        </Text>
      </Stack>
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
