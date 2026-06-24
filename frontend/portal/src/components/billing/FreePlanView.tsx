import { useState } from "react";
import { Banner, Button, Card } from "@shared/components";
import type { Wallet } from "@portal/api/billing";
import type { SaasCurrency } from "@portal/billing/stripe";
import { WalletMeter } from "@portal/components/billing/WalletMeter";
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
 * Linked, not yet subscribed. Shows the lifetime free meter + the Processor
 * plan explainer card. The "Turn on Processor" CTA opens the embedded Stripe
 * Checkout modal (same UX the SaaS web app uses — the admin stays in the
 * portal).
 */
export function FreePlanView({ wallet, onSubscribed }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [missingTeam, setMissingTeam] = useState<string | null>(null);

  const isLeader = wallet.role === "leader";
  const currency: SaasCurrency = isSaasCurrency(wallet.currency)
    ? wallet.currency
    : "usd";

  function openCheckout() {
    if (wallet.teamId == null) {
      setMissingTeam("No team is resolved on your wallet yet — refresh and try again.");
      return;
    }
    setMissingTeam(null);
    setModalOpen(true);
  }

  return (
    <div className="portal-billing__stack">
      <WalletMeter wallet={wallet} />

      <Card padding="loose" className="portal-billing__plan-card">
        <span className="portal-billing__eyebrow">Processor plan · metered</span>
        <h2 className="portal-billing__plan-title">
          Turn on the Processor plan
        </h2>
        <p className="portal-billing__plan-sub">
          Keep going past your {wallet.freeAllowance.toLocaleString()} free PDFs
          with automation, AI, and the API. Set a monthly ceiling so you stay in
          control.
        </p>

        <ul className="portal-billing__plan-features">
          <li>
            <strong>Automation pipelines</strong>: chain tools, schedule runs,
            batch process.
          </li>
          <li>
            <strong>AI tools</strong>: summarise, classify, redact, AI-OCR.
          </li>
          <li>
            <strong>API access</strong>: call any Stirling endpoint
            programmatically.
          </li>
          <li>
            <strong>Editor plan stays free</strong> — view, sign, merge, split,
            watermark, compress, convert, manual OCR — always.
          </li>
        </ul>

        {missingTeam && (
          <Banner tone="warning" title="Couldn't start checkout">
            {missingTeam}
          </Banner>
        )}

        <div className="portal-billing__plan-actions">
          {isLeader ? (
            <Button
              variant="gradient"
              onClick={openCheckout}
              disabled={wallet.teamId == null}
            >
              Turn on Processor →
            </Button>
          ) : (
            <p className="portal-billing__plan-readonly">
              Only the team owner can enable the Processor plan.
            </p>
          )}
          <span className="portal-billing__plan-reassure">
            No minimum · Set a $0 cap to test · Cancel anytime
          </span>
        </div>
      </Card>

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
