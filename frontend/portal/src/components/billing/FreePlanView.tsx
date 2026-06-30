import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, StatusBadge } from "@shared/components";
import type { Wallet } from "@portal/api/billing";
import type { SaasCurrency } from "@portal/billing/stripe";
import { WalletMeter } from "@portal/components/billing/WalletMeter";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";
import { EnterpriseUpsell } from "@portal/components/billing/EnterpriseUpsell";
import { StripeCheckoutModal } from "@portal/components/billing/StripeCheckoutModal";

interface Props {
  wallet: Wallet;
  /** Called after checkout completes so the parent refetches the wallet. */
  onSubscribed?: () => void;
}

function isSaasCurrency(c: string | null): c is SaasCurrency {
  return c === "usd" || c === "eur" || c === "gbp";
}

/**
 * Linked, not yet subscribed — the "Editor" current plan. Shows the team's free
 * editor fleet, the Processor trial meter (with the inline "Switch on the
 * Processor" CTA → embedded Stripe Checkout), and the Enterprise upsell.
 */
export function FreePlanView({ wallet, onSubscribed }: Props) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [missingTeam, setMissingTeam] = useState<string | null>(null);

  const isLeader = wallet.role === "leader";
  const currency: SaasCurrency = isSaasCurrency(wallet.currency)
    ? wallet.currency
    : "usd";

  function openCheckout() {
    if (wallet.teamId == null) {
      setMissingTeam(
        t(
          "billing.freePlan.noTeamResolved",
          "No team is resolved on your wallet yet — refresh and try again.",
        ),
      );
      return;
    }
    setMissingTeam(null);
    setModalOpen(true);
  }

  const switchOnAction = isLeader ? (
    <Button
      variant="gradient"
      onClick={openCheckout}
      disabled={wallet.teamId == null}
    >
      {t("billing.freePlan.switchOnProcessor", "Switch on the Processor →")}
    </Button>
  ) : null;

  return (
    <div className="portal-billing__stack">
      {/* Current plan */}
      <div className="portal-billing__current-plan">
        <span className="portal-billing__eyebrow">
          {t("billing.freePlan.currentPlan", "Current plan")}
        </span>
        <div className="portal-billing__current-plan-row">
          <h2 className="portal-billing__current-plan-name">
            {t("billing.freePlan.planName", "Editor")}
          </h2>
          <StatusBadge tone="success" size="sm" showDot={false}>
            {t("billing.freePlan.freeForever", "Free forever")}
          </StatusBadge>
          <StatusBadge tone="info" size="sm" showDot={false}>
            {t("billing.freePlan.ssoIncluded", "SSO included")}
          </StatusBadge>
          <StatusBadge tone="purple" size="sm" showDot={false}>
            {t("billing.freePlan.unlimitedUsers", "Unlimited users")}
          </StatusBadge>
        </div>
      </div>

      <FreePdfEditorsCard />

      {/* Processor trial — meter with the inline upgrade CTA */}
      <WalletMeter wallet={wallet} action={switchOnAction} />

      {missingTeam && (
        <Banner
          tone="warning"
          title={t(
            "billing.freePlan.checkoutErrorTitle",
            "Couldn't start checkout",
          )}
        >
          {missingTeam}
        </Banner>
      )}
      {!isLeader && (
        <p className="portal-billing__plan-readonly">
          {t(
            "billing.freePlan.ownerOnly",
            "Only the team owner can switch on the Processor plan.",
          )}
        </p>
      )}

      {/* Volume discount / Enterprise */}
      <EnterpriseUpsell />

      {wallet.teamId != null && (
        <StripeCheckoutModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          teamId={wallet.teamId}
          currency={currency}
          onComplete={() => {
            setModalOpen(false);
            onSubscribed?.();
          }}
        />
      )}
    </div>
  );
}
