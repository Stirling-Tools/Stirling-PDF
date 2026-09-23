import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui";
import type { Wallet } from "@portal/api/billing";
import type { SaasCurrency } from "@portal/billing/stripe";
import { StripeCheckoutModal } from "@portal/components/billing/StripeCheckoutModal";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";

interface Props {
  wallet: Wallet;
  /**
   * Which activation modal is open, when the host wants to drive it. Supplied so the Processor
   * row's own door can start this flow: the flow itself, its bundle state and its modals all stay
   * here, and only the step is lifted.
   */
  step?: "choose" | "payg" | "prepay" | null;
  onStepChange?: (step: "choose" | "payg" | "prepay" | null) => void;
  /**
   * Runs the post-checkout activation poll and resolves true once the wallet
   * reads subscribed (false if it's lagging past the poll window). The checkout
   * modal awaits this to stay open through activation.
   */
  onSubscribed?: () => Promise<boolean>;
  /** Refresh the host's quote status when an activation dialog closes. */
  onActivationClosed?: () => void;
}

function isSaasCurrency(c: string | null): c is SaasCurrency {
  return c === "usd" || c === "eur" || c === "gbp";
}

/**
 * Owns the activation dialogs; the host supplies the Processor row action that opens them.
 * Nothing renders here at rest — a held prepaid pool reads on the Processor row itself.
 */
export function FreePlanView({
  wallet,
  step: controlledStep,
  onStepChange,
  onSubscribed,
  onActivationClosed,
}: Props) {
  const { t } = useTranslation();
  const [ownStep, setOwnStep] = useState<"choose" | "payg" | "prepay" | null>(
    null,
  );
  const step = onStepChange ? (controlledStep ?? null) : ownStep;
  const setStep = onStepChange ?? setOwnStep;

  const currency: SaasCurrency = isSaasCurrency(wallet.currency)
    ? wallet.currency
    : "usd";
  // Every dialog below needs a team to scope checkout, so an unresolved one would open nothing
  // at all. Saying so beats a door that silently does nothing.
  const missingTeam = step != null && wallet.teamId == null;

  // Closing any activation modal re-reads the flow state so the CTA reflects a
  // freshly-minted quote / invoice without a full page reload.
  function closeModals() {
    setStep(null);
    onActivationClosed?.();
  }

  return (
    <div className="portal-billing__stack">
      {missingTeam && (
        <Banner
          tone="warning"
          title={t(
            "portal.billing.freePlan.checkoutErrorTitle",
            "Couldn't start checkout",
          )}
        >
          {t(
            "portal.billing.freePlan.noTeamResolved",
            "No team is resolved on your wallet yet — refresh and try again.",
          )}
        </Banner>
      )}
      {wallet.teamId != null && (
        <StripeCheckoutModal
          open={step === "payg" || step === "choose"}
          onClose={closeModals}
          onPrepay={() => setStep("prepay")}
          teamId={wallet.teamId}
          currency={currency}
          pricePerDocMinor={wallet.pricePerDocMinor}
          initialCapUsd={wallet.capUsd}
          onComplete={() => onSubscribed?.() ?? Promise.resolve(false)}
        />
      )}

      {/* Prepay reuses the bundle modal (free team → first-purchase copy, no cap
          step). On completion the webhook credits the pool; we still poll onSubscribed
          like the payg path, but flipping the wallet to subscribed depends on the
          metered-subscription auto-provisioning off the saved card, a known follow-up
          that's NOT yet wired — so for a prepay-only team this poll can just time out
          until then. */}
      {wallet.teamId != null && (
        <BundleCheckoutModal
          open={step === "prepay"}
          onClose={closeModals}
          onBack={() => setStep("payg")}
          wallet={wallet}
          onComplete={() => {
            closeModals();
            void onSubscribed?.();
          }}
        />
      )}
    </div>
  );
}
