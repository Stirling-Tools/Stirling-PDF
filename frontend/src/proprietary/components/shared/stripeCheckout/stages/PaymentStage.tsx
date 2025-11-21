import React from 'react';
import { Stack, Button, Paper, Group, Text, Loader } from '@mantine/core';
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
  selectedPeriod: 'monthly' | 'yearly';
  planName: string;
  loading: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onPaymentComplete: () => void;
}

export const PaymentStage: React.FC<PaymentStageProps> = ({
  clientSecret,
  selectedPlan,
  selectedPeriod,
  planName,
  loading,
  canGoBack,
  onBack,
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
      {/* Back button */}
      {canGoBack && (
        <Button
          variant="subtle"
          onClick={onBack}
          disabled={loading}
          style={{ alignSelf: 'flex-start' }}
        >
          ← {t('payment.paymentStage.backToPlan', 'Back to Plan Selection')}
        </Button>
      )}

      {/* Selected plan summary */}
      <Paper withBorder p="md" radius="md" bg="gray.0">
        <Group justify="space-between">
          <div>
            <Text size="sm" c="dimmed">
              {t('payment.paymentStage.selectedPlan', 'Selected Plan')}
            </Text>
            <Text size="lg" fw={600}>
              {planName} - {selectedPeriod === 'yearly' ? t('payment.yearly', 'Yearly') : t('payment.monthly', 'Monthly')}
            </Text>
          </div>
          <Text size="xl" fw={700}>
            {selectedPlan.currency}{selectedPlan.price.toFixed(2)}
          </Text>
        </Group>
      </Paper>

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
