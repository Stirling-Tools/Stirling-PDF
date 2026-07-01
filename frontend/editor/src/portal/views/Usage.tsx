import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@shared/components";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { fetchWallet, type Wallet } from "@portal/api/billing";
import { useStripePortal } from "@portal/hooks/useStripePortal";
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
  const { t } = useTranslation();
  const { isLinked, setLinkState, saasSessionNonce } = useLink();
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
  // Stripe customer portal — the subscribed header's "Manage Payment" action.
  const portal = useStripePortal(wallet);
  // Guards the post-checkout poll loop from setState after unmount.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
          setError(
            t(
              "usage.error.walletUnavailable",
              "Wallet unavailable: {{status}} {{statusText}}",
              {
                status: e.status,
                statusText: e.statusText,
              },
            ),
          );
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
        if (!mounted.current) return;
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
      if (!mounted.current) return;
    }
    // Webhook still hasn't landed after ~20s: stop blocking and refresh. The page
    // self-heals on the next load once provisioning completes.
    setFinalizing(false);
    setRefreshKey((k) => k + 1);
  }, [setLinkState]);

  return (
    <div className="portal-usage portal-billing">
      <header className="portal-usage__header">
        <div className="portal-usage__header-inner">
          <div>
            <h1 className="portal-usage__title">
              {t("usage.title", "Usage & billing")}
            </h1>
            <p className="portal-usage__subtitle">
              {t(
                "usage.subtitle",
                "Consumption, invoices, and plan management for every PDF Stirling has billed, in one console.",
              )}
            </p>
          </div>
          {wallet?.status === "subscribed" && (
            <Button
              variant="outline"
              size="sm"
              loading={portal.opening}
              onClick={portal.open}
            >
              {t("usage.managePayment", "Manage Payment")}
            </Button>
          )}
        </div>
      </header>

      <div className="portal-usage__body">
        {!isLinked && <LinkAccountPrompt />}

        {isLinked && loading && (
          <div className="portal-billing__skeleton" aria-hidden>
            <Skeleton height="10rem" />
            <Skeleton height="14rem" />
          </div>
        )}

        {isLinked && finalizing && (
          <Banner
            tone="info"
            title={t("usage.finalizing.title", "Finalizing your subscription…")}
          >
            {t(
              "usage.finalizing.body",
              "It can take a few seconds for your subscription to activate. This page updates automatically.",
            )}
          </Banner>
        )}

        {isLinked && needsReauth && (
          <Banner
            tone="warning"
            title={t("usage.sessionExpired.title", "Session expired")}
            action={
              <Button size="sm" onClick={() => openLinkModal("reauth")}>
                {t("usage.sessionExpired.action", "Sign in again")}
              </Button>
            }
          >
            {t(
              "usage.sessionExpired.body",
              "Your Stirling account session has expired. Sign in again to view billing — your instance stays linked.",
            )}
          </Banner>
        )}

        {isLinked && error && (
          <Banner
            tone="danger"
            title={t("usage.error.loadWallet", "Couldn't load wallet")}
          >
            {error}
          </Banner>
        )}

        {isLinked && portal.error && (
          <Banner
            tone="danger"
            title={t(
              "usage.error.openStripePortal",
              "Couldn't open Stripe portal",
            )}
          >
            {portal.error}
          </Banner>
        )}

        {isLinked && !finalizing && wallet && wallet.status === "free" && (
          <FreePlanView wallet={wallet} onSubscribed={confirmSubscription} />
        )}

        {isLinked && wallet && wallet.status === "subscribed" && (
          <SubscribedPlanView wallet={wallet} onWalletChange={refresh} />
        )}
      </div>
    </div>
  );
}
