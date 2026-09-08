import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, StatusBadge } from "@app/ui";
import type { Wallet } from "@portal/api/billing";
import type { SaasCurrency } from "@portal/billing/stripe";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";
import { EnterpriseUpsell } from "@portal/components/billing/EnterpriseUpsell";
import { StripeCheckoutModal } from "@portal/components/billing/StripeCheckoutModal";
import { ActivationChoiceModal } from "@portal/components/billing/ActivationChoiceModal";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { PrepaidCapacityCard } from "@portal/components/billing/PrepaidCapacityCard";
import { useBundleFlowState } from "@portal/hooks/useBundleFlowState";

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
}

function isSaasCurrency(c: string | null): c is SaasCurrency {
  return c === "usd" || c === "eur" || c === "gbp";
}

/**
 * Linked, not yet subscribed — the "Editor" current plan. Shows the team's free
 * editor fleet, the Processor trial meter (with the inline "Switch on the
 * Processor" CTA → embedded Stripe Checkout), and the Enterprise upsell.
 */
export function FreePlanView({
  wallet,
  step: controlledStep,
  onStepChange,
  onSubscribed,
}: Props) {
  const { t } = useTranslation();
  // Activation fork (demo D97): choose → the metered checkout (payg) or the
  // discounted bundle (prepay). Exactly one is open at a time.
  const [ownStep, setOwnStep] = useState<"choose" | "payg" | "prepay" | null>(
    null,
  );
  const step = onStepChange ? (controlledStep ?? null) : ownStep;
  const setStep = onStepChange ?? setOwnStep;
  const [missingTeam, setMissingTeam] = useState<string | null>(null);

  const isLeader = wallet.role === "leader";
  const currency: SaasCurrency = isSaasCurrency(wallet.currency)
    ? wallet.currency
    : "usd";

  // Where this team sits in the prepaid-bundle flow, read on load so the CTA names
  // the resume action rather than always restarting the fork. Leader + team gated
  // (the RPC 403s otherwise). Refreshed when any activation modal closes.
  const flow = useBundleFlowState(wallet.teamId, isLeader);

  function requireTeam(): boolean {
    if (wallet.teamId == null) {
      setMissingTeam(
        t(
          "portal.billing.freePlan.noTeamResolved",
          "No team is resolved on your wallet yet — refresh and try again.",
        ),
      );
      return false;
    }
    setMissingTeam(null);
    return true;
  }

  // No quote yet → open the pay-as-you-go vs prepay fork. A quote already in flight
  // → skip the fork and reopen the bundle modal directly; its resume effect lands
  // on the calculator (quote) or the payment step (invoice awaiting payment).
  function openActivation() {
    if (requireTeam()) setStep("choose");
  }
  function resumeBundle() {
    if (requireTeam()) setStep("prepay");
  }

  // Closing any activation modal re-reads the flow state so the CTA reflects a
  // freshly-minted quote / invoice without a full page reload.
  function closeModals() {
    setStep(null);
    flow.refresh();
  }

  const switchOnAction = isLeader ? (
    <Button
      variant="primary"
      onClick={flow.status === "none" ? openActivation : resumeBundle}
      disabled={wallet.teamId == null}
    >
      {flow.status === "invoice"
        ? t("portal.billing.freePlan.payInvoice", "Pay invoice to complete")
        : flow.status === "quote"
          ? t("portal.billing.freePlan.viewQuote", "View quote")
          : t(
              "portal.billing.freePlan.switchOnProcessor",
              "Switch on the Processor →",
            )}
    </Button>
  ) : null;

  return (
    <div className="portal-billing__stack">
      {/* Current plan */}
      <div className="portal-billing__current-plan">
        <span className="portal-billing__eyebrow">
          {t("portal.billing.freePlan.currentPlan", "Current plan")}
        </span>
        <div className="portal-billing__current-plan-row">
          <h2 className="portal-billing__current-plan-name">
            {t("portal.billing.freePlan.planName", "Editor")}
          </h2>
          <StatusBadge tone="success" size="sm" showDot={false}>
            {t("portal.billing.freePlan.freeForever", "Free forever")}
          </StatusBadge>
          <StatusBadge tone="info" size="sm" showDot={false}>
            {t("portal.billing.freePlan.everyPdfTool", "Every PDF tool")}
          </StatusBadge>
          <StatusBadge tone="purple" size="sm" showDot={false}>
            {t(
              "portal.billing.freePlan.anywhere",
              "Web, desktop & self-hosted",
            )}
          </StatusBadge>
        </div>
      </div>

      <FreePdfEditorsCard />

      {/* Prepaid capacity is usable independent of a metered subscription, so surface it here on the
          free plan too (not just the subscribed dashboard) whenever the team holds a live pool. */}
      {wallet.prepaidUnitsRemaining > 0 && (
        <PrepaidCapacityCard
          wallet={wallet}
          onBuy={isLeader ? resumeBundle : undefined}
        />
      )}

      {/* The Processor meter itself is BillingScreen's ProcessorPlanCard now, so only the
          activation action remains here, next to the flow state it depends on. */}
      {switchOnAction && (
        <div className="portal-billing__prepaid-foot">{switchOnAction}</div>
      )}

      {missingTeam && (
        <Banner
          tone="warning"
          title={t(
            "portal.billing.freePlan.checkoutErrorTitle",
            "Couldn't start checkout",
          )}
        >
          {missingTeam}
        </Banner>
      )}
      {!isLeader && (
        <p className="portal-billing__plan-readonly">
          {t(
            "portal.billing.freePlan.ownerOnly",
            "Only the team owner can switch on the Processor plan.",
          )}
        </p>
      )}

      {/* Volume discount / Enterprise */}
      <EnterpriseUpsell />

      <ActivationChoiceModal
        open={step === "choose"}
        onClose={closeModals}
        onChoosePayg={() => setStep("payg")}
        onChoosePrepay={() => setStep("prepay")}
      />

      {wallet.teamId != null && (
        <StripeCheckoutModal
          open={step === "payg"}
          onClose={closeModals}
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
