import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Text, Alert, Loader, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import {
  createCheckoutSession,
  getStripePublishableKey,
} from "@app/services/billing";
import { openExternal } from "@app/platform/openExternal";
import { Z_INDEX_OVER_SETTINGS_MODAL } from "@app/styles/zIndex";

export type PlanID = "pro" | null;

interface StripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  // Saas-specific props
  planId?: PlanID;
  planName?: string;
  planPrice?: number;
  currency?: string;
  isTrialConversion?: boolean;
  // Proprietary-specific props (for compatibility)
  planGroup?: unknown;
  minimumSeats?: number;
  onLicenseActivated?: (licenseInfo: {
    licenseType: string;
    enabled: boolean;
    maxUsers: number;
    hasKey: boolean;
  }) => void;
  hostedCheckoutSuccess?: {
    isUpgrade: boolean;
    licenseKey?: string;
  } | null;
  // Common props
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
}

type CheckoutState = {
  status: "idle" | "loading" | "ready" | "success" | "error";
  clientSecret?: string;
  error?: string;
  sessionParams?: {
    planId: PlanID;
  };
};

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  opened,
  onClose,
  planId,
  planName,
  isTrialConversion,
  onSuccess,
  onError,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  // Load Stripe.js lazily, only when this checkout component mounts. Loading
  // at module scope pulled the Stripe script into every page that imports
  // this file, which triggered the dev "HTTPS required" warning on every
  // non-payment route. The publishable key is sourced through the billing
  // seam — cloud code may not read import.meta.env directly.
  const stripePromise = useMemo(
    () => loadStripe(getStripePublishableKey()),
    [],
  );

  const startCheckoutSession = async () => {
    try {
      setState({ status: "loading" });

      const session = await createCheckoutSession({
        uiMode: "embedded",
        plan: planId,
        isTrialConversion: isTrialConversion || false,
      });

      // Embedded checkout returns a clientSecret to mount the iframe; a hosted
      // url is the fallback path — hand it to the system browser and close.
      if (session.url && !session.clientSecret) {
        await openExternal(session.url);
        setState({ status: "idle" });
        onClose();
        return;
      }

      if (!session.clientSecret) {
        throw new Error("No client secret received from server");
      }

      setState({
        status: "ready",
        clientSecret: session.clientSecret,
        sessionParams: {
          planId: planId!,
        },
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to create checkout session";
      setState({
        status: "error",
        error: errorMessage,
      });
      onError?.(errorMessage);
    }
  };

  const handlePaymentComplete = () => {
    setState({ status: "success" });

    // Call success callback immediately - parent will handle timing
    onSuccess?.("");

    // Note: Parent (Plan.tsx) now handles the delay and modal closing
  };

  const handleClose = () => {
    // Reset state to idle to clean up the session
    setState({
      status: "idle",
      clientSecret: undefined,
      error: undefined,
      sessionParams: undefined,
    });
    onClose();
  };

  // Initialize checkout when modal opens or parameters change
  useEffect(() => {
    if (opened) {
      // Check if we need a new session (first time or parameters changed)
      const needsNewSession =
        state.status === "idle" ||
        !state.sessionParams ||
        state.sessionParams.planId !== planId;

      if (needsNewSession) {
        startCheckoutSession();
      }
    } else if (!opened) {
      // Clean up state when modal closes
      setState({
        status: "idle",
        clientSecret: undefined,
        error: undefined,
        sessionParams: undefined,
      });
    }
  }, [opened, planId]);

  const renderContent = () => {
    switch (state.status) {
      case "loading":
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader size="lg" />
            <Text size="sm" c="dimmed" mt="md">
              {t("payment.preparing", "Preparing your checkout...")}
            </Text>
          </div>
        );

      case "ready":
        if (!state.clientSecret) return null;

        return (
          <EmbeddedCheckoutProvider
            key={state.clientSecret}
            stripe={stripePromise}
            options={{
              clientSecret: state.clientSecret,
              onComplete: handlePaymentComplete,
            }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        );

      case "success":
        return (
          <Alert
            color="green"
            title={t("payment.success", "Payment Successful!")}
          >
            <Stack gap="md">
              <Text size="sm">
                {t(
                  "payment.successMessage",
                  "Your plan has been upgraded successfully. You will receive a confirmation email shortly.",
                )}
              </Text>
              <Text size="xs" c="dimmed">
                {t(
                  "payment.autoClose",
                  "This window will close automatically...",
                )}
              </Text>
            </Stack>
          </Alert>
        );

      case "error":
        return (
          <Alert color="red" title={t("payment.error", "Payment Error")}>
            <Stack gap="md">
              <Text size="sm">{state.error}</Text>
              <Button variant="outline" onClick={handleClose}>
                {t("common.close", "Close")}
              </Button>
            </Stack>
          </Alert>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <div>
          <Text fw={600} size="lg">
            {t("payment.upgradeTitle", "Upgrade to {{planName}}", { planName })}
          </Text>
        </div>
      }
      size="xl"
      centered
      withCloseButton={true}
      closeOnEscape={true}
      closeOnClickOutside={false}
      zIndex={Z_INDEX_OVER_SETTINGS_MODAL}
    >
      {renderContent()}
    </Modal>
  );
};

export default StripeCheckout;
export { StripeCheckout };
