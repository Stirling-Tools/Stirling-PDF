import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, StatusBadge } from "@app/ui";
import type { Wallet } from "@portal/api/billing";
import type { LocalUsage } from "@portal/api/link";
import type { SaasCurrency } from "@portal/billing/stripe";
import { WalletMeter } from "@portal/components/billing/WalletMeter";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";
import { EnterpriseUpsell } from "@portal/components/billing/EnterpriseUpsell";
import { StripeCheckoutModal } from "@portal/components/billing/StripeCheckoutModal";
import { ActivationChoiceModal } from "@portal/components/billing/ActivationChoiceModal";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";

interface Props {
  wallet: Wallet;
  /** Instance-local usage not yet synced to SaaS; folded into the trial meter. */
  unsynced?: LocalUsage | null;
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
export function FreePlanView({ wallet, unsynced, onSubscribed }: Props) {
  const { t } = useTranslation();
  // Activation fork (demo D97): choose → the metered checkout (payg) or the
  // discounted bundle (prepay). Exactly one is open at a time.
  const [step, setStep] = useState<"choose" | "payg" | "prepay" | null>(null);
  const [missingTeam, setMissingTeam] = useState<string | null>(null);

  const isLeader = wallet.role === "leader";
  const currency: SaasCurrency = isSaasCurrency(wallet.currency)
    ? wallet.currency
    : "usd";

  function openCheckout() {
    if (wallet.teamId == null) {
      setMissingTeam(
        t(
          "portal.billing.freePlan.noTeamResolved",
          "No team is resolved on your wallet yet — refresh and try again.",
        ),
      );
      return;
    }
    setMissingTeam(null);
    setStep("choose");
  }

  const switchOnAction = isLeader ? (
    <Button
      variant="primary"
      accent="premium"
      onClick={openCheckout}
      disabled={wallet.teamId == null}
    >
      {t(
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
            {t("portal.billing.freePlan.ssoIncluded", "SSO included")}
          </StatusBadge>
          <StatusBadge tone="purple" size="sm" showDot={false}>
            {t("portal.billing.freePlan.unlimitedUsers", "Unlimited users")}
          </StatusBadge>
        </div>
      </div>

      <FreePdfEditorsCard />

      {/* Processor trial — meter with the inline upgrade CTA */}
      <WalletMeter
        wallet={wallet}
        unsynced={unsynced}
        action={switchOnAction}
      />

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
        onClose={() => setStep(null)}
        onChoosePayg={() => setStep("payg")}
        onChoosePrepay={() => setStep("prepay")}
      />

      {wallet.teamId != null && (
        <StripeCheckoutModal
          open={step === "payg"}
          onClose={() => setStep(null)}
          teamId={wallet.teamId}
          currency={currency}
          pricePerDocMinor={wallet.pricePerDocMinor}
          initialCapUsd={wallet.capUsd}
          onComplete={() => onSubscribed?.() ?? Promise.resolve(false)}
        />
      )}

      {/* Prepay reuses the bundle modal (free team → first-purchase copy, no cap
          step). On completion the webhook credits the pool AND silently creates
          the metered subscription off the saved card, so we poll like the payg
          path to flip the wallet to subscribed. */}
      {wallet.teamId != null && (
        <BundleCheckoutModal
          open={step === "prepay"}
          onClose={() => setStep(null)}
          wallet={wallet}
          onComplete={() => {
            setStep(null);
            void onSubscribed?.();
          }}
        />
      )}
    </div>
  );
}
