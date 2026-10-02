import React, { useEffect, useMemo } from "react";
import { Stack, Text, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { PlanTier } from "@app/services/licenseService";
import { Button } from "@app/ui/Button";
import { openStripePage } from "@app/platform/stripeNavigation";
import { STRIPE_RETURN_EVENT } from "@app/constants/billingEvents";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

interface PaymentStageProps {
  clientSecret: string | null;
  /** Checkout opened outside this page (desktop's browser); payment completes there. */
  hostedUrl?: string | null;
  selectedPlan: PlanTier | null;
  onPaymentComplete: () => void;
}

export const PaymentStage: React.FC<PaymentStageProps> = ({
  clientSecret,
  hostedUrl = null,
  selectedPlan,
  onPaymentComplete,
}) => {
  const { t } = useTranslation();
  // Load Stripe.js lazily, only when PaymentStage mounts. Loading at module
  // scope pulled the Stripe script into every page (CheckoutContext is in
  // AppProviders), which triggered the dev "HTTPS required" warning on every
  // non-payment route.
  const stripePromise = useMemo(
    () => (STRIPE_KEY && !hostedUrl ? loadStripe(STRIPE_KEY) : null),
    [hostedUrl],
  );

  useEffect(() => {
    if (!hostedUrl) return;
    const onReturn = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string")
        return;
      const status = new URLSearchParams(event.detail).get("payment_status");
      if (status === "success") onPaymentComplete();
    };
    window.addEventListener(STRIPE_RETURN_EVENT, onReturn);
    return () => window.removeEventListener(STRIPE_RETURN_EVENT, onReturn);
  }, [hostedUrl, onPaymentComplete]);

  if (hostedUrl) {
    return (
      <Stack align="center" gap="md" style={{ padding: "2rem 0" }}>
        <Text size="sm">
          {t(
            "payment.browserCheckout",
            "Checkout is open in your browser. Come back here once you have paid.",
          )}
        </Text>
        <Stack gap="xs" align="center">
          <Button onClick={onPaymentComplete}>
            {t("payment.browserCheckoutDone", "I've paid")}
          </Button>
          <Button variant="secondary" onClick={() => openStripePage(hostedUrl)}>
            {t("payment.browserCheckoutReopen", "Open checkout again")}
          </Button>
        </Stack>
      </Stack>
    );
  }

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
