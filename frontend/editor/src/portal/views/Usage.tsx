import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { BillingScreen } from "@app/billing";
import {
  fetchWallet,
  refreshWalletCache,
  type Wallet,
} from "@portal/api/billing";
import {
  fetchLocalUsage,
  triggerLocalSync,
  type LocalUsage,
} from "@portal/api/link";
import { useStripePortal } from "@portal/hooks/useStripePortal";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { PaymentSection } from "@portal/components/billing/PaymentSection";
import { InvoicesSection } from "@portal/components/billing/InvoicesSection";
import { fetchFleetStats } from "@portal/api/fleetStats";
import { fetchAdminEmail } from "@portal/api/users";
import { useCheckoutOptional } from "@app/contexts/CheckoutContext";
import { SubscribedPlanView } from "@portal/components/billing/SubscribedPlanView";
import {
  HttpError,
  SaasNotLinkedError,
  SaasUnconfiguredError,
} from "@portal/api/http";
import "@portal/views/Usage.css";
import "@portal/components/billing/billing.css";

export interface UsageProps {
  /**
   * Called with the wallet whenever it loads (initial fetch + post-checkout
   * flip). A flavor-agnostic hook the composition uses for cross-cutting state —
   * self-hosted maps it onto the link/tier dimension; SaaS ignores it.
   */
  onWalletLoaded?: (wallet: Wallet) => void;
  /**
   * Invoked when the SaaS session has lapsed and the user chooses to re-sign-in.
   * When omitted, the "session expired" notice shows without a sign-in action.
   * Self-hosted wires this to its re-auth flow; SaaS leaves it unset (its session
   * is owned by the app, so this path never triggers).
   */
  onReauth?: () => void;
  /** A prop rather than a hook, as {@link onReauth} is: reaching for a router here would make
   * this view unrenderable wherever one is absent. */
  onEnterpriseQuote?: () => void;
}

/**
 * The portal's host for {@link BillingScreen}: it owns the data loading, session handling and
 * Stripe portal action, and passes its own detail sections through {@code extras}. Whether the
 * page is shown at all is the billing gate's decision, upstream.
 *
 * <p>Wallet comes from {@code GET /api/v1/payg/wallet} (apiClient.saas); a checkout or cancel
 * re-reads it. Only the {@code extras} sections still branch on {@code wallet.status} — the two
 * products render from their own holdings, which that axis cannot express.
 */
export function Usage({
  onWalletLoaded,
  onReauth,
  onEnterpriseQuote,
}: UsageProps = {}) {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  // Locally-accrued usage SaaS hasn't billed yet; added to the synced figure so
  // "current usage" reflects work since the last daily sync. Best-effort.
  const [localUsage, setLocalUsage] = useState<LocalUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The SaaS session has lapsed and needs a re-sign-in (self-hosted only).
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // From fleet-stats, not the wallet. Null when the backend cannot compute it, which omits the row.
  const [editorsDeployed, setEditorsDeployed] = useState<number | null>(null);
  // A team never billed has none, and the section and its chip then drop out.
  const [hasInvoices, setHasInvoices] = useState(true);
  // Email only: this endpoint is admin-only, so nothing both editions need may come from it.
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  // Held here, not in the detail views that own the flows, so the product rows can start them.
  const [activationStep, setActivationStep] = useState<
    "choose" | "payg" | "prepay" | null
  >(null);
  const [adjustingLimit, setAdjustingLimit] = useState(false);
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
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    // Independent of the wallet load — a local-usage failure must not break the
    // page; it just means no unsynced delta is shown.
    fetchAdminEmail()
      .then((e) => {
        if (!cancelled) setAdminEmail(e);
      })
      .catch(() => {
        if (!cancelled) setAdminEmail(null);
      });
    fetchFleetStats()
      .then((f) => {
        if (!cancelled) setEditorsDeployed(f.editorsDeployed);
      })
      .catch(() => {
        if (!cancelled) setEditorsDeployed(null);
      });
    fetchLocalUsage()
      .then((u) => {
        if (!cancelled) setLocalUsage(u);
      })
      .catch(() => {
        if (!cancelled) setLocalUsage(null);
      });
    fetchWallet()
      .then((w) => {
        if (cancelled) return;
        setWallet(w);
        onWalletLoaded?.(w);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof SaasNotLinkedError) {
          // The attended SaaS session expired — offer a re-sign-in.
          setSessionExpired(true);
        } else if (e instanceof SaasUnconfiguredError) {
          setError(e.message);
        } else if (e instanceof HttpError) {
          setError(
            t(
              "portal.usage.error.walletUnavailable",
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
  }, [refreshKey, onWalletLoaded, t]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const onInvoicesEmpty = useCallback(() => setHasInvoices(false), []);

  // The same flow the settings plan section uses, so there is one purchase implementation.
  // Optional on purpose: a build that mounts no provider must lose the door, not the page.
  const checkout = useCheckoutOptional();
  const heldLimit = wallet?.team?.held ? wallet.team.licensedUsers : null;
  const usersInUse = wallet?.team?.usersInUse;
  const addCapacity = useCallback(() => {
    void checkout?.openCheckout("server", {
      email: adminEmail ?? undefined,
      currentLimit: heldLimit,
      minimumSeats: usersInUse,
      onSuccess: () => setRefreshKey((k) => k + 1),
    });
  }, [checkout, adminEmail, heldLimit, usersInUse]);

  const confirmSubscription = useCallback(async (): Promise<boolean> => {
    // Stripe's onComplete fires before the subscription webhook lands, so poll the
    // wallet until it flips to subscribed. Drop the server cache before each read
    // so we see the webhook the moment it lands rather than after the ~30s TTL.
    // ~60s of attempts — longer than the observed webhook + sync-engine latency —
    // so a slightly slow activation still completes inside the (open) checkout
    // modal instead of falling back to a manual refresh. Resolves true once
    // subscribed so the modal can close itself in.
    for (let i = 0; i < 30; i++) {
      try {
        await refreshWalletCache().catch(() => {});
        const w = await fetchWallet();
        if (!mounted.current) return false;
        if (w.status === "subscribed") {
          setWallet(w);
          onWalletLoaded?.(w);
          // Nudge the local instance to refresh its gate now so billable work
          // unblocks immediately rather than on its next poll. Fire-and-forget;
          // a no-op on SaaS (no local instance to sync).
          triggerLocalSync().catch(() => {});
          return true;
        }
      } catch {
        // Transient read failure — keep polling.
      }
      await new Promise((r) => setTimeout(r, 2000));
      if (!mounted.current) return false;
    }
    // Webhook still hasn't landed: re-fetch once more and report back so the modal
    // shows its "almost there" notice rather than the page silently self-healing.
    setRefreshKey((k) => k + 1);
    return false;
  }, [onWalletLoaded]);

  const paying = Boolean(wallet?.processor?.active || wallet?.team?.held);

  return (
    <BillingScreen
      wallet={wallet}
      loading={loading}
      pendingUnits={localUsage?.totalUnsyncedUnits ?? 0}
      notices={
        <>
          {sessionExpired && (
            <Banner
              tone="warning"
              title={t("portal.usage.sessionExpired.title", "Session expired")}
              action={
                onReauth ? (
                  <Button size="sm" onClick={onReauth}>
                    {t("portal.usage.sessionExpired.action", "Sign in again")}
                  </Button>
                ) : undefined
              }
            >
              {t(
                "portal.usage.sessionExpired.body",
                "Your Stirling account session has expired. Sign in again to view billing — your instance stays linked.",
              )}
            </Banner>
          )}

          {error && (
            <Banner
              tone="danger"
              title={t("portal.usage.error.loadWallet", "Couldn't load wallet")}
            >
              {error}
            </Banner>
          )}

          {portal.error && (
            <Banner
              tone="danger"
              title={t(
                "portal.usage.error.openStripePortal",
                "Couldn't open Stripe portal",
              )}
            >
              {portal.error}
            </Banner>
          )}
        </>
      }
      editorsDeployed={editorsDeployed}
      onAddCapacity={
        checkout && wallet?.role === "leader" ? addCapacity : undefined
      }
      onActivateProcessor={
        wallet?.role === "leader" && !wallet?.processor?.active
          ? () => setActivationStep("choose")
          : undefined
      }
      onGovernSpend={
        wallet?.role === "leader" && wallet?.processor?.active
          ? () => setAdjustingLimit(true)
          : undefined
      }
      onEnterpriseQuote={onEnterpriseQuote}
      paymentSection={
        paying && wallet ? (
          <PaymentSection
            wallet={wallet}
            onManage={portal.open}
            managing={portal.opening}
          />
        ) : undefined
      }
      invoicesSection={
        paying && hasInvoices ? (
          <InvoicesSection onEmpty={onInvoicesEmpty} />
        ) : undefined
      }
      extras={
        <>
          {wallet && wallet.status === "free" && (
            <FreePlanView
              wallet={wallet}
              step={activationStep}
              onStepChange={setActivationStep}
              onSubscribed={confirmSubscription}
            />
          )}

          {wallet && wallet.status === "subscribed" && (
            <SubscribedPlanView
              wallet={wallet}
              unsynced={localUsage}
              onWalletChange={refresh}
              adjusting={adjustingLimit}
              onAdjustingChange={setAdjustingLimit}
            />
          )}
        </>
      }
    />
  );
}
