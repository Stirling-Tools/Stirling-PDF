import React, { useEffect } from "react";
import { Modal, Text, Group } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import licenseService from "@app/services/licenseService";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import {
  CheckoutStage,
  StripeCheckoutProps,
} from "@app/components/shared/stripeCheckout/types/checkout";
import { StepModalHeader } from "@app/components/shared/StepModalHeader";
import { getModalTitle } from "@app/components/shared/stripeCheckout/utils/checkoutUtils";
import { calculateSavings } from "@app/components/shared/stripeCheckout/utils/savingsCalculator";
import { useCheckoutState } from "@app/components/shared/stripeCheckout/hooks/useCheckoutState";
import { useCheckoutNavigation } from "@app/components/shared/stripeCheckout/hooks/useCheckoutNavigation";
import { useLicensePolling } from "@app/components/shared/stripeCheckout/hooks/useLicensePolling";
import { useCheckoutSession } from "@app/components/shared/stripeCheckout/hooks/useCheckoutSession";
import { PlanSelectionStage } from "@app/components/shared/stripeCheckout/stages/PlanSelectionStage";
import { CapacityStage } from "@app/components/shared/stripeCheckout/stages/CapacityStage";
import { blocksForUsers } from "@app/components/shared/stripeCheckout/utils/capacity";
import { PaymentStage } from "@app/components/shared/stripeCheckout/stages/PaymentStage";
import { SuccessStage } from "@app/components/shared/stripeCheckout/stages/SuccessStage";
import { ErrorStage } from "@app/components/shared/stripeCheckout/stages/ErrorStage";

// Validate Stripe key (static validation, no dynamic imports)
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_KEY) {
  console.error(
    "VITE_STRIPE_PUBLISHABLE_KEY environment variable is required. " +
      "Please add it to your .env file. " +
      "Get your key from https://dashboard.stripe.com/apikeys",
  );
}

if (STRIPE_KEY && !STRIPE_KEY.startsWith("pk_")) {
  console.error(
    `Invalid Stripe publishable key format. ` +
      `Expected key starting with 'pk_', got: ${STRIPE_KEY.substring(0, 10)}...`,
  );
}

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  opened,
  onClose,
  planGroup,
  minimumSeats = 1,
  combinedChoose = false,
  currentLimit = null,
  onSuccess,
  onError,
  onLicenseActivated,
  hostedCheckoutSuccess,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // Initialize all state via custom hook
  const checkoutState = useCheckoutState(planGroup);

  // Initialize navigation hooks
  const navigation = useCheckoutNavigation(
    checkoutState.state,
    checkoutState.setState,
    checkoutState.stageHistory,
    checkoutState.setStageHistory,
  );

  // Initialize license polling hook
  const polling = useLicensePolling(
    checkoutState.isMountedRef,
    checkoutState.setPollingStatus,
    checkoutState.setLicenseKey,
    onLicenseActivated,
  );

  // Initialize checkout session hook
  const session = useCheckoutSession(
    checkoutState.selectedPlan,
    checkoutState.state,
    checkoutState.setState,
    checkoutState.installationId,
    checkoutState.setInstallationId,
    checkoutState.currentLicenseKey,
    checkoutState.setCurrentLicenseKey,
    checkoutState.setPollingStatus,
    minimumSeats,
    checkoutState.serverQuantity,
    polling.pollForLicenseKey,
    onSuccess,
    onError,
    onLicenseActivated,
  );

  // Calculate savings
  const savings = calculateSavings(planGroup, minimumSeats);

  // Only the Team tier is sold by capacity. Enterprise is priced per seat and free has nothing to
  // size, so both go straight to payment.
  const sellsCapacity = planGroup.tier === "server";

  // Plan selection handler
  const handlePlanSelect = (period: "monthly" | "yearly") => {
    checkoutState.setSelectedPeriod(period);
    if (sellsCapacity) {
      // Arrive on the capacity an installation already needs rather than on a blocked minimum.
      checkoutState.setServerQuantity(blocksForUsers(minimumSeats));
      navigation.goToStage("capacity");
      return;
    }
    navigation.goToStage("payment");
  };

  // Close handler
  const handleClose = () => {
    // Clear any active polling
    if (checkoutState.pollingTimeoutRef.current) {
      clearTimeout(checkoutState.pollingTimeoutRef.current);
      checkoutState.pollingTimeoutRef.current = null;
    }

    checkoutState.resetState();
    onClose();
  };

  // Cleanup on unmount
  useEffect(() => {
    checkoutState.isMountedRef.current = true;

    return () => {
      checkoutState.isMountedRef.current = false;
      if (checkoutState.pollingTimeoutRef.current) {
        clearTimeout(checkoutState.pollingTimeoutRef.current);
        checkoutState.pollingTimeoutRef.current = null;
      }
    };
  }, [checkoutState.isMountedRef, checkoutState.pollingTimeoutRef]);

  // Initialize stage based on existing license
  useEffect(() => {
    if (!opened) return;

    // Handle hosted checkout success - open directly to success state
    if (hostedCheckoutSuccess) {
      console.log("Opening modal to success state for hosted checkout return");

      // Set appropriate state based on upgrade vs new subscription
      if (hostedCheckoutSuccess.isUpgrade) {
        checkoutState.setCurrentLicenseKey("existing"); // Flag to indicate upgrade
        checkoutState.setPollingStatus("ready");
      } else if (hostedCheckoutSuccess.licenseKey) {
        checkoutState.setLicenseKey(hostedCheckoutSuccess.licenseKey);
        checkoutState.setPollingStatus("ready");
      }

      // Set to success state to show success UI
      checkoutState.setState({ currentStage: "success", loading: false });
      return;
    }

    // Nobody is asked for an email any more: the checkout is minted as the buyer's Stirling
    // account and the edge function resolves their address from the team's billing owner. The
    // licence read stays, because an upgrade carries its old key through as Stripe metadata.
    const openOnFirstChoice = async () => {
      const landing = combinedChoose ? "choose" : "plan-selection";
      try {
        const licenseInfo = await licenseService.getLicenseInfo();
        if (licenseInfo?.licenseType && licenseInfo.licenseType !== "NORMAL") {
          checkoutState.setCurrentLicenseKey(licenseInfo.licenseKey || null);
        }
      } catch (error) {
        // An unreadable licence only costs the upgrade metadata, so the purchase still proceeds.
        console.warn("Could not check for existing license:", error);
      }
      checkoutState.setState({ currentStage: landing, loading: false });
    };

    openOnFirstChoice();
  }, [
    opened,
    hostedCheckoutSuccess,
    checkoutState.setCurrentLicenseKey,
    checkoutState.setPollingStatus,
    checkoutState.setLicenseKey,
    checkoutState.setState,
  ]);

  // Trigger checkout session creation when entering payment stage
  useEffect(() => {
    if (
      checkoutState.state.currentStage === "payment" &&
      !checkoutState.state.clientSecret &&
      !checkoutState.state.loading
    ) {
      session.createCheckoutSession();
    }
  }, [
    checkoutState.state.currentStage,
    checkoutState.state.clientSecret,
    checkoutState.state.loading,
    session,
  ]);

  // Render stage content
  const renderContent = () => {
    // Don't block checkout - hosted mode works without publishable key
    // The checkout will automatically redirect to Stripe hosted page if key is missing
    switch (checkoutState.state.currentStage) {
      // Page 1 of 2: both choices at once, which is how the design puts them in front of a buyer.
      // The period cards select rather than navigate, and capacity supplies the single continue.
      case "choose":
        return (
          <>
            <PlanSelectionStage
              planGroup={planGroup}
              minimumSeats={minimumSeats}
              savings={savings}
              selectedPeriod={checkoutState.selectedPeriod}
              onSelectPlan={(period) => {
                checkoutState.setSelectedPeriod(period);
                if (sellsCapacity) {
                  checkoutState.setServerQuantity(
                    Math.max(
                      blocksForUsers(minimumSeats),
                      checkoutState.serverQuantity || 1,
                    ),
                  );
                }
              }}
            />
            {sellsCapacity && (
              <CapacityStage
                selectedPlan={checkoutState.selectedPlan}
                serverQuantity={checkoutState.serverQuantity}
                setServerQuantity={checkoutState.setServerQuantity}
                currentUsers={minimumSeats}
                currentLimit={currentLimit}
                onContinue={() => navigation.goToStage("payment")}
              />
            )}
          </>
        );

      case "plan-selection":
        return (
          <PlanSelectionStage
            planGroup={planGroup}
            minimumSeats={minimumSeats}
            savings={savings}
            onSelectPlan={handlePlanSelect}
          />
        );

      case "capacity":
        return (
          <CapacityStage
            selectedPlan={checkoutState.selectedPlan}
            serverQuantity={checkoutState.serverQuantity}
            setServerQuantity={checkoutState.setServerQuantity}
            currentUsers={minimumSeats}
            onContinue={() => navigation.goToStage("payment")}
          />
        );

      case "payment":
        return (
          <PaymentStage
            clientSecret={checkoutState.state.clientSecret || null}
            selectedPlan={checkoutState.selectedPlan}
            onPaymentComplete={session.handlePaymentComplete}
          />
        );

      case "success":
        return (
          <SuccessStage
            pollingStatus={checkoutState.pollingStatus}
            currentLicenseKey={checkoutState.currentLicenseKey}
            licenseKey={checkoutState.licenseKey}
            onClose={handleClose}
          />
        );

      case "error":
        return (
          <ErrorStage
            error={checkoutState.state.error || "An unknown error occurred"}
            onClose={handleClose}
          />
        );

      default:
        return null;
    }
  };

  const canGoBack = checkoutState.stageHistory.length > 0;
  // The combined flow wears the stepped chrome, counting the pages it actually walks: the email
  // page only when the caller supplied no address. The separate walk keeps its own title, because
  // a step count would be a lie about how many pages it has.
  const steppedPath: CheckoutStage[] | null = combinedChoose
    ? ["choose", "payment"]
    : null;
  const steppedIndex = steppedPath
    ? steppedPath.indexOf(checkoutState.state.currentStage)
    : -1;
  const steppedStep = steppedIndex >= 0 ? steppedIndex + 1 : null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        steppedStep ? undefined : (
          <Group gap="sm" wrap="nowrap">
            {canGoBack && (
              <ActionIcon
                variant="tertiary"
                size="lg"
                onClick={navigation.goBack}
                aria-label={t("common.back", "Back")}
              >
                <LocalIcon icon="arrow-back" width={20} height={20} />
              </ActionIcon>
            )}
            <Text fw={600} size="lg">
              {getModalTitle(
                checkoutState.state.currentStage,
                planGroup.name,
                t,
              )}
            </Text>
          </Group>
        )
      }
      size={isMobile ? "100%" : 980}
      centered
      radius="lg"
      withCloseButton={!steppedStep}
      closeOnEscape={true}
      closeOnClickOutside={false}
      fullScreen={isMobile}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      styles={{
        body: {},
        content: {
          maxHeight: "95vh",
        },
      }}
    >
      {steppedStep && (
        <StepModalHeader
          title={
            currentLimit != null
              ? t("payment.addCapacity.title", "Add capacity")
              : t("payment.upgradeTeam.title", "Upgrade to Team")
          }
          subtitle={
            currentLimit != null
              ? t(
                  "payment.addCapacity.currently",
                  "Currently up to {{users}} users",
                  { users: currentLimit },
                )
              : undefined
          }
          step={steppedStep}
          total={steppedPath?.length ?? 0}
          stepLabel={t("payment.stepOf", "Step {{n}} of {{total}}", {
            n: steppedStep,
            total: steppedPath?.length ?? 0,
          })}
          onClose={handleClose}
        />
      )}
      {renderContent()}
    </Modal>
  );
};

export default StripeCheckout;
