import { useEffect, useState, useCallback } from "react";
import { useBanner } from "@app/contexts/BannerContext";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "react-i18next";
import { InfoBanner } from "@app/components/shared/InfoBanner";
import StripeCheckout from "@app/components/shared/StripeCheckoutSaas";
import { BASE_PATH } from "@app/constants/app";

const SESSION_STORAGE_KEY = "trialBannerDismissed";

export function TrialStatusBanner() {
  const { setBanner } = useBanner();
  const { t } = useTranslation();
  const { trialStatus } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
  });
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Only show banner during ACTIVE trial (not after expiration - modal handles that)
  // Don't show if payment method already added (user has scheduled subscription)
  const shouldShowBanner =
    trialStatus &&
    trialStatus.isTrialing && // Only show during active trial
    trialStatus.daysRemaining > 0 && // Trial hasn't expired yet
    !trialStatus.hasPaymentMethod &&
    !trialStatus.hasScheduledSub &&
    !dismissed;

  if (trialStatus?.hasPaymentMethod || trialStatus?.hasScheduledSub) {
    console.log("Subscription scheduled - hiding trial banner");
  }

  const handleOpenCheckout = useCallback(() => {
    setCheckoutOpen(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
  }, []);

  useEffect(() => {
    if (!shouldShowBanner) {
      setBanner(null);
      return;
    }

    const trialEndDate = new Date(trialStatus.trialEnd).toLocaleDateString(
      "en-GB",
      {
        month: "short",
        day: "numeric",
      },
    );

    const message = t(
      "plan.trial.message",
      `Your trial ends in ${trialStatus.daysRemaining} day${trialStatus.daysRemaining !== 1 ? "s" : ""} (${trialEndDate}). Subscribe to continue Pro access.`,
      { days: trialStatus.daysRemaining, date: trialEndDate },
    );

    const logoIcon = (
      <img
        src={`${BASE_PATH}/modern-logo/logo512.png`}
        alt="Stirling PDF"
        style={{
          width: "1.5rem",
          height: "1.5rem",
          objectFit: "contain",
        }}
      />
    );

    setBanner(
      <InfoBanner
        icon={logoIcon}
        tone="info"
        message={message}
        buttonText={t("plan.trial.subscribe", "Subscribe to Pro")}
        buttonIcon="credit-card-rounded"
        onButtonClick={handleOpenCheckout}
        onDismiss={handleDismiss}
        dismissible={true}
        show={true}
        background="var(--mantine-color-dark-7)"
        borderColor="var(--mantine-color-dark-5)"
        textColor="rgba(255, 255, 255, 0.95)"
        iconColor="rgba(255, 255, 255, 0.95)"
        buttonColor="gray"
        buttonVariant="white"
        buttonTextColor="var(--mantine-color-dark-9)"
        closeIconColor="rgba(255, 255, 255, 0.7)"
      />,
    );

    return () => {
      setBanner(null);
    };
  }, [
    shouldShowBanner,
    trialStatus,
    setBanner,
    t,
    handleOpenCheckout,
    handleDismiss,
  ]);

  const handleCheckoutSuccess = () => {
    // Refresh to hide banner and show updated plan
    window.location.reload();
  };

  return (
    <>
      {trialStatus && (
        <StripeCheckout
          opened={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          purchaseType="subscription"
          planId="pro"
          creditsPack={null}
          planName="Pro"
          onSuccess={handleCheckoutSuccess}
          onError={(error) => console.error("Checkout error:", error)}
          isTrialConversion={true}
        />
      )}
    </>
  );
}
