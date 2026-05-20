import React, { useState, useEffect } from "react";
import { Modal, Button, Text, Alert, Loader, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { supabase } from "@app/auth/supabase";
import { Z_INDEX_OVER_SETTINGS_MODAL } from "@app/styles/zIndex";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export type PurchaseType = "subscription" | "credits";
export type CreditsPack = "xsmall" | "small" | "medium" | "large" | null;
export type PlanID = "pro" | null;

interface StripeCheckoutProps {
  opened: boolean;
  onClose: () => void;
  // Saas-specific props
  planId?: PlanID;
  purchaseType?: PurchaseType;
  creditsPack?: CreditsPack;
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
    purchaseType: PurchaseType;
    planId: PlanID;
    creditsPack: CreditsPack;
  };
};

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  opened,
  onClose,
  planId,
  purchaseType,
  creditsPack,
  planName,
  isTrialConversion,
  onSuccess,
  onError,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckoutState>({ status: "idle" });

  const createCheckoutSession = async () => {
    try {
      setState({ status: "loading" });

      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: {
            purchase_type: purchaseType,
            ui_mode: "embedded",
            plan: planId,
            credits_pack: creditsPack,
            callback_base_url: window.location.origin,
            trial_conversion: isTrialConversion || false,
          },
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to create checkout session");
      }

      if (!data) {
        throw new Error("No data received from server");
      }

      const jsonData = typeof data === "string" ? JSON.parse(data) : data;

      if (!jsonData?.clientSecret) {
        throw new Error("No client secret received from server");
      }

      setState({
        status: "ready",
        clientSecret: jsonData.clientSecret,
        sessionParams: {
          purchaseType: purchaseType!,
          planId: planId!,
          creditsPack: creditsPack!,
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
        state.sessionParams.purchaseType !== purchaseType ||
        state.sessionParams.planId !== planId ||
        state.sessionParams.creditsPack !== creditsPack;

      if (needsNewSession) {
        console.log("Creating new checkout session:", {
          purchaseType,
          planId,
          creditsPack,
        });
        createCheckoutSession();
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
  }, [opened, purchaseType, planId, creditsPack]);

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
