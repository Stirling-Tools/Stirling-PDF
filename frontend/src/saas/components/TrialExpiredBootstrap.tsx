import { useEffect, useState } from "react";
import { useAuth } from "@app/auth/UseSession";
import { TrialExpiredModal } from "@app/components/shared/TrialExpiredModal";
import StripeCheckout from "@app/components/shared/StripeCheckoutSaas";

/**
 * Bootstrap component that shows the trial expired modal when a user's trial has ended
 * and they haven't added a payment method. Shows once per user per expired trial.
 */
export default function TrialExpiredBootstrap() {
  const { user, trialStatus, isPro } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);

  useEffect(() => {
    // Close modal if user logs out or session expires
    if (!user) {
      if (showModal) {
        console.debug("[TrialExpired] User logged out, closing modal");
        setShowModal(false);
      }
      if (checkoutOpened) {
        setCheckoutOpened(false);
      }
      return;
    }

    // Only check conditions when auth is fully loaded
    if (trialStatus === null || isPro === null) {
      return;
    }

    // Build localStorage key unique to this user
    const storageKey = `trialExpiredModalShown_${user.id}`;
    const hasSeenModal = localStorage.getItem(storageKey) === "true";

    // If user is currently trialing, clear any previous "seen" flag
    // This handles the edge case where a user might re-enter a trial
    if (trialStatus.isTrialing) {
      if (hasSeenModal) {
        console.debug("[TrialExpired] User is trialing, clearing seen flag");
        localStorage.removeItem(storageKey);
      }
      return;
    }

    // Check if all conditions are met to show the modal
    const isExpired =
      trialStatus.status === "incomplete_expired" ||
      trialStatus.status === "canceled";
    const hasNoPayment =
      !trialStatus.hasPaymentMethod && !trialStatus.hasScheduledSub;
    const wasDowngraded = !isPro;
    const trialEndedRecently = trialStatus.daysRemaining === 0;

    const shouldShowModal =
      isExpired &&
      hasNoPayment &&
      wasDowngraded &&
      trialEndedRecently &&
      !hasSeenModal;

    if (shouldShowModal) {
      console.debug("[TrialExpired] Showing trial expired modal", {
        status: trialStatus.status,
        daysRemaining: trialStatus.daysRemaining,
        hasPaymentMethod: trialStatus.hasPaymentMethod,
        hasScheduledSub: trialStatus.hasScheduledSub,
        isPro,
      });
      setShowModal(true);
    }
  }, [user, trialStatus, isPro, showModal, checkoutOpened]);

  const handleClose = () => {
    if (user) {
      const storageKey = `trialExpiredModalShown_${user.id}`;
      localStorage.setItem(storageKey, "true");
      console.debug("[TrialExpired] Modal dismissed, marking as seen");
    }
    setShowModal(false);
  };

  const handleSubscribe = () => {
    console.debug("[TrialExpired] User clicked Subscribe to Pro");
    setCheckoutOpened(true);
  };

  const handleCheckoutSuccess = () => {
    console.debug("[TrialExpired] Subscription successful, refreshing page");
    // Close modal and refresh to update subscription status
    handleClose();
    window.location.reload();
  };

  const handleCheckoutClose = () => {
    console.debug("[TrialExpired] Checkout closed");
    setCheckoutOpened(false);
  };

  return (
    <>
      <TrialExpiredModal
        opened={showModal && !checkoutOpened}
        onClose={handleClose}
        onSubscribe={handleSubscribe}
      />

      {user && (
        <StripeCheckout
          opened={checkoutOpened}
          onClose={handleCheckoutClose}
          purchaseType="subscription"
          planId="pro"
          creditsPack={null}
          planName="Pro"
          onSuccess={handleCheckoutSuccess}
          onError={(error) =>
            console.error("[TrialExpired] Checkout error:", error)
          }
          isTrialConversion={false} // Trial already ended, so this is not a conversion
        />
      )}
    </>
  );
}
