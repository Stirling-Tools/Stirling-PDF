import { useState } from "react";
import { Banner, Button, Card } from "@shared/components";
import type { Wallet } from "@portal/api/billing";
import { createCheckoutSession, type SaasCurrency } from "@portal/billing/stripe";
import { WalletMeter } from "@portal/components/billing/WalletMeter";

interface Props {
  wallet: Wallet;
}

/**
 * Linked, not yet subscribed. Shows the lifetime free meter + a PAYG explainer
 * card. The "Turn on Pay-as-you-go" CTA mints a Stripe checkout session via
 * the SaaS edge function (same path the SaaS web app uses) and redirects.
 */
export function FreePlanView({ wallet }: Props) {
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const isLeader = wallet.role === "leader";

  async function startCheckout() {
    if (wallet.teamId == null) return;
    setStarting(true);
    setCheckoutError(null);
    try {
      // Use the wallet's resolved currency if any; default to "usd" — the
      // edge function only supports usd/eur/gbp.
      const currency =
        wallet.currency && isSaasCurrency(wallet.currency)
          ? (wallet.currency as SaasCurrency)
          : ("usd" as SaasCurrency);
      const { url } = await createCheckoutSession({
        teamId: wallet.teamId,
        currency,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });
      window.location.href = url;
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  function isSaasCurrency(c: string): c is SaasCurrency {
    return c === "usd" || c === "eur" || c === "gbp";
  }

  return (
    <div className="portal-billing__stack">
      <WalletMeter wallet={wallet} />

      <Card padding="loose" className="portal-billing__plan-card">
        <span className="portal-billing__eyebrow">Pay-as-you-go plan</span>
        <h2 className="portal-billing__plan-title">
          Turn on Pay-as-you-go
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
            <strong>Manual PDF editing stays free</strong> — view, sign, merge,
            split, watermark, compress, convert, manual OCR — always.
          </li>
        </ul>

        {checkoutError && (
          <Banner tone="danger" title="Couldn't start checkout">
            {checkoutError}
          </Banner>
        )}

        <div className="portal-billing__plan-actions">
          {isLeader ? (
            <Button
              variant="gradient"
              loading={starting}
              onClick={startCheckout}
              disabled={wallet.teamId == null}
            >
              Turn on Pay-as-you-go →
            </Button>
          ) : (
            <p className="portal-billing__plan-readonly">
              Only the team owner can enable Pay-as-you-go.
            </p>
          )}
          <span className="portal-billing__plan-reassure">
            No minimum · Set a $0 cap to test · Cancel anytime
          </span>
        </div>
      </Card>
    </div>
  );
}
