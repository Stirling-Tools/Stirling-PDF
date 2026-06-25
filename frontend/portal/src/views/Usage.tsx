import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Skeleton, StatusBadge } from "@shared/components";
import { useLink, LINK_INFO } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
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
  const { linkState, isLinked, setLinkState, saasSessionNonce } = useLink();
  const { openLinkModal } = useUI();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState<boolean>(isLinked);
  const [error, setError] = useState<string | null>(null);
  // The instance is linked but the browser's SaaS session has lapsed — needs a
  // re-sign-in, NOT a re-link.
  const [needsReauth, setNeedsReauth] = useState(false);
  // Briefly polling the wallet after a successful checkout until the webhook flips
  // it to subscribed.
  const [finalizing, setFinalizing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Only fetch the wallet when the instance is linked. Unlinked → render the
    // link prompt; no SaaS call needed.
    if (!isLinked) {
      setWallet(null);
      setLoading(false);
      setError(null);
      setNeedsReauth(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNeedsReauth(false);
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
        if (e instanceof SaasNotLinkedError) {
          // Reached only when the instance IS linked (we don't fetch otherwise),
          // so this means the attended SaaS session expired — prompt re-sign-in.
          setNeedsReauth(true);
        } else if (e instanceof SaasUnconfiguredError) {
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
  }, [isLinked, refreshKey, saasSessionNonce, setLinkState]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const confirmSubscription = useCallback(async () => {
    // Stripe's onComplete fires before the subscription webhook lands, so poll the
    // wallet briefly until it flips to subscribed rather than dropping the
    // just-paid admin back on the free CTA.
    setFinalizing(true);
    for (let i = 0; i < 10; i++) {
      try {
        const w = await fetchWallet();
        if (w.status === "subscribed") {
          setWallet(w);
          setLinkState("linked-subscribed");
          setFinalizing(false);
          return;
        }
      } catch {
        // Transient read failure — keep polling.
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    // Webhook still hasn't landed after ~20s: stop blocking and refresh. The page
    // self-heals on the next load once provisioning completes.
    setFinalizing(false);
    setRefreshKey((k) => k + 1);
  }, [setLinkState]);

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

      {isLinked && finalizing && (
        <Banner tone="info" title="Finalizing your subscription…">
          It can take a few seconds for your subscription to activate. This page
          updates automatically.
        </Banner>
      )}

      {isLinked && needsReauth && (
        <Banner
          tone="warning"
          title="Session expired"
          action={
            <Button size="sm" onClick={() => openLinkModal("reauth")}>
              Sign in again
            </Button>
          }
        >
          Your Stirling account session has expired. Sign in again to view
          billing — your instance stays linked.
        </Banner>
      )}

      {isLinked && error && (
        <Banner tone="danger" title="Couldn't load wallet">
          {error}
        </Banner>
      )}

      {isLinked && !finalizing && wallet && wallet.status === "free" && (
        <FreePlanView wallet={wallet} onSubscribed={confirmSubscription} />
      )}

      {isLinked && wallet && wallet.status === "subscribed" && (
        <SubscribedPlanView wallet={wallet} onWalletChange={refresh} />
      )}
    </div>
  );
}
