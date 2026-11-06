import React from "react";
import { Stack, Text, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { PlanTier } from "@editor/services/licenseService";
import { Button } from "@editor/ui/Button";
import { useStripeJs } from "@editor/hooks/useStripeJs";

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
  const {
    stripe,
    failed: stripeFailed,
    retry: retryStripe,
  } = useStripeJs(STRIPE_KEY || null, "plan_checkout");

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

  if (!STRIPE_KEY) {
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

  if (stripeFailed) {
    return (
      <Stack align="center" gap="md" style={{ padding: "2rem 0" }}>
        <Text fw={600}>
          {t("payment.stripeLoadFailed.title", "Payment form could not load")}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {t(
            "payment.stripeLoadFailed.body",
            "Your browser could not reach Stripe. Turn off ad or script blockers for this site, check your connection, then try again.",
          )}
        </Text>
        <Button onClick={retryStripe}>
          {t("payment.stripeLoadFailed.retry", "Try again")}
        </Button>
      </Stack>
    );
  }

  if (!stripe) {
    return (
      <Stack align="center" justify="center" style={{ padding: "2rem 0" }}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Stripe Embedded Checkout */}
      <EmbeddedCheckoutProvider
        key={clientSecret}
        stripe={stripe}
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
