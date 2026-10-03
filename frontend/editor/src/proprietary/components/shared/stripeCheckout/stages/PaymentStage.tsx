import React, { useMemo } from "react";
import { Stack, Text, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { PlanTier } from "@app/services/licenseService";
import { canUseEmbeddedCheckout } from "@app/utils/protocolDetection";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

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
  // Load Stripe.js lazily, only when PaymentStage mounts. Loading at module
  // scope pulled the Stripe script into every page (CheckoutContext is in
  // AppProviders), which triggered the dev "HTTPS required" warning on every
  // non-payment route.
  //
  // Only load Stripe.js in a secure context. A live publishable key
  // (pk_live_…) makes Stripe.js throw "Live Stripe.js integrations must use
  // HTTPS" on plain-HTTP origins (common for self-hosted LAN deployments).
  // On non-HTTPS origins the backend issues a hosted-checkout redirect via
  // useCheckoutSession, so embedded checkout is never used here — skipping
  // loadStripe lets that redirect take over cleanly.
  const stripePromise = useMemo(
    () =>
      STRIPE_KEY && canUseEmbeddedCheckout() ? loadStripe(STRIPE_KEY) : null,
    [],
  );

  // Show loading while creating checkout session
  if (!clientSecret || !selectedPlan) {
    return (
      <Stack align="center" justify="center" style={{ padding: "2rem 0" }}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed" mt="md">
          {t("payment.preparing", "Preparing your checkout...")}
        </Text>
      </Stack>
    );
  }

  if (!stripePromise) {
    // This should only happen if embedded mode was attempted without key
    // Hosted checkout should have redirected before reaching this component
    return (
      <Stack align="center" gap="md" style={{ padding: "2rem 0" }}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed" mt="md">
          {t("payment.redirecting", "Redirecting to secure checkout...")}
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
