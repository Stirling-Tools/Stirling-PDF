import { useCallback, useEffect, useState } from "react";
import { Banner, Skeleton, StatusBadge } from "@shared/components";
import { useLink, LINK_INFO } from "@portal/contexts/LinkContext";
import { fetchWallet, type Wallet } from "@portal/api/billing";
import { LinkAccountPrompt } from "@portal/components/billing/LinkAccountPrompt";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { SubscribedPlanView } from "@portal/components/billing/SubscribedPlanView";
import {
  HttpError,
  SaasNotLinkedError,
  SaasUnconfiguredError,
} from "@portal/api/http";
import "@portal/views/Usage.css";
import "@portal/components/billing/billing.css";

/**
 * Billing & usage page. State-driven by the link/subscription dimension —
 * NOT by the legacy {@code tier} prop:
 *
 *   unlinked          → LinkAccountPrompt
 *   linked-free       → FreePlanView (free meter + PAYG explainer)
 *   linked-subscribed → SubscribedPlanView (period meter, cap, members,
 *                       invoices, Stripe portal)
 *
 * Wallet comes from {@code GET /api/v1/payg/wallet} (apiClient.saas). After a
 * subscription flip via Stripe checkout / cancel via the portal, the
 * onWalletChange refresh re-reads and the view re-dispatches on the new
 * status.
 */
export function Usage() {
  const { linkState, isLinked, setLinkState } = useLink();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState<boolean>(isLinked);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Only fetch the wallet when the instance is linked. Unlinked → render the
    // link prompt; no SaaS call needed.
    if (!isLinked) {
      setWallet(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWallet()
      .then((w) => {
        if (cancelled) return;
        setWallet(w);
        // Derive the linked-free / linked-subscribed dimension from the live
        // wallet. Only refines a `linked-*` state; never flips unlinked → linked.
        setLinkState(
          w.status === "subscribed" ? "linked-subscribed" : "linked-free",
        );
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof SaasUnconfiguredError || e instanceof SaasNotLinkedError) {
          setError(e.message);
        } else if (e instanceof HttpError) {
          setError(`Wallet unavailable: ${e.status} ${e.statusText}`);
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLinked, refreshKey, setLinkState]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="portal-usage portal-billing">
      <header className="portal-usage__header">
        <div>
          <h1 className="portal-usage__title">Usage & billing</h1>
          <p className="portal-usage__subtitle">
            What you've used, what you'll pay, and how to change it.
          </p>
        </div>
        <StatusBadge
          tone={
            linkState === "linked-subscribed"
              ? "success"
              : linkState === "linked-free"
                ? "info"
                : "neutral"
          }
          size="md"
        >
          {LINK_INFO[linkState].label}
        </StatusBadge>
      </header>

      {!isLinked && <LinkAccountPrompt />}

      {isLinked && loading && (
        <div className="portal-billing__skeleton" aria-hidden>
          <Skeleton height="10rem" />
          <Skeleton height="14rem" />
        </div>
      )}

      {isLinked && error && (
        <Banner tone="danger" title="Couldn't load wallet">
          {error}
        </Banner>
      )}

      {isLinked && wallet && wallet.status === "free" && (
        <FreePlanView wallet={wallet} />
      )}

      {isLinked && wallet && wallet.status === "subscribed" && (
        <SubscribedPlanView wallet={wallet} onWalletChange={refresh} />
      )}
    </div>
  );
}
