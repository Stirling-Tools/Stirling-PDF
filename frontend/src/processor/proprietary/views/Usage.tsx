import { TeamSubscriptionChange } from "@editor/billing/TeamSubscriptionChange";
import { fetchCheckoutPricing } from "@editor/portal/billing/stripe";
import type { ServerPlan } from "@editor/billing/serverPlan";
import { fleetUsersInUse } from "@editor/billing/fleetSeats";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Banner, Button } from "@editor/ui";
import { BillingScreen, KvRow, formatPeriodDate } from "@editor/billing";
import { useLegacySubscriptions } from "@editor/hooks/useLegacySubscriptions";
import { LegacySubscriptionPlan } from "@editor/components/shared/config/LegacySubscriptionPlan";
import { useProcurementSnapshot } from "@processor/components/procurement/useProcurement";
import { DealStatusHero } from "@processor/components/procurement/DealStatusHero";
import { useOpenEnterprise } from "@processor/components/procurement/enterprisePath";
import {
  fetchWallet,
  refreshWalletCache,
  type Wallet,
} from "@editor/portal/api/billing";
import { fetchLocalUsage, triggerLocalSync } from "@editor/portal/api/link";
import { useAccountLinkOptional } from "@editor/portal/contexts/AccountLinkContext";
import { usePortalSaasSession } from "@editor/portal/hooks/usePortalSaasSession";
import { useStripePortal } from "@editor/portal/hooks/useStripePortal";
import { useBundleFlowState } from "@editor/portal/hooks/useBundleFlowState";
import { FreePlanView } from "@editor/portal/components/billing/FreePlanView";
import { PaymentSection } from "@editor/portal/components/billing/PaymentSection";
import { InvoicesSection } from "@editor/portal/components/billing/InvoicesSection";
import { useFleetStats } from "@editor/portal/queries/infrastructure";
import { qk } from "@editor/portal/queries/keys";
import { walletQuery, WALLET_POLL_MS } from "@editor/portal/queries/wallet";
import { useCheckoutOptional } from "@editor/contexts/CheckoutContext";
import { SubscribedPlanView } from "@editor/portal/components/billing/SubscribedPlanView";
import {
  HttpError,
  SaasSessionRequiredError,
  SaasUnconfiguredError,
} from "@editor/portal/api/http";
import "@editor/portal/views/Usage.css";
import "@editor/portal/components/billing/billing.css";

export interface UsageProps {
  /** Local occupied seats for self-hosted; undefined keeps the SaaS membership count. */
  localUsersInUse?: number | null;
  localUserLimit?: number | null;
  serverPlan?: ServerPlan;
  serverPlanAction?: ReactNode;
  /**
   * Called with the wallet whenever it loads (initial fetch + post-checkout
   * flip). A flavor-agnostic hook the composition uses for cross-cutting state —
   * self-hosted maps it onto the link/tier dimension; SaaS ignores it.
   */
  onWalletLoaded?: (wallet: Wallet) => void;
  /** Self-hosted supplies its owner-only renewal notice; hosted authentication belongs to the app. */
  sessionRecovery?: ReactNode;
  /** Only the self-hosted host supplies local license management; notify after activation. */
  renderLicenseSection?: (onSaved: () => void) => ReactNode;
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
  localUsersInUse,
  localUserLimit,
  serverPlan,
  serverPlanAction,
  onWalletLoaded,
  sessionRecovery,
  renderLicenseSection,
}: UsageProps = {}) {
  const { t } = useTranslation();
  const legacyBilling = useLegacySubscriptions();
  const queryClient = useQueryClient();
  // The gate renders this page only for a linked instance.
  const walletOptions = walletQuery(true);
  const {
    data: loadedWallet = null,
    isPending: walletPending,
    error: walletError,
    refetch: refetchWallet,
    // Moves on every successful read, which is what the renewal notice wants as
    // its cue to re-read: the same triggers the page's old refresh counter had.
    dataUpdatedAt: walletReadAt,
  } = useQuery(walletOptions);
  const refresh = useCallback(() => {
    void refetchWallet();
    void queryClient.invalidateQueries({ queryKey: qk.localUsage() });
  }, [refetchWallet, queryClient]);
  const accountLink = useAccountLinkOptional();
  const { revision: sessionRevision, required } = usePortalSaasSession();
  const sessionExpired = walletError instanceof SaasSessionRequiredError;
  const needsRenewal = Boolean(sessionRecovery) && (sessionExpired || required);
  const wallet = needsRenewal ? null : loadedWallet;
  const previousSessionRevision = useRef(sessionRevision);
  useEffect(() => {
    if (previousSessionRevision.current === sessionRevision) return;
    previousSessionRevision.current = sessionRevision;
    refresh();
  }, [sessionRevision, refresh]);
  const dealQuery = useProcurementSnapshot();
  const deal = dealQuery.data;
  // Session failures surface through the session banner; anything else is shown here, since an
  // unknown deal must not be read as "no deal" and offered a fresh start.
  const dealError =
    dealQuery.error && !(dealQuery.error instanceof SaasSessionRequiredError)
      ? dealQuery.error.message
      : null;
  const openEnterprise = useOpenEnterprise();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLeader = wallet?.role === "leader";
  const bundleFlow = useBundleFlowState(
    wallet?.teamId,
    isLeader && wallet?.status === "free",
  );

  // Locally-accrued usage SaaS hasn't billed yet; added to the synced figure so
  // "current usage" reflects work since the last daily sync. Best-effort.
  const hasLocalInstance = localUsersInUse !== undefined;
  const { data: localUsage = null } = useQuery({
    queryKey: qk.localUsage(),
    queryFn: () => fetchLocalUsage().catch(() => null),
    enabled: hasLocalInstance,
    refetchInterval: WALLET_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: WALLET_POLL_MS,
    retry: false,
  });
  // From fleet-stats, not the wallet. Null when the backend cannot compute it, which omits the row.
  const { data: fleetStats } = useFleetStats();
  const editorsDeployed = fleetStats?.editorsDeployed ?? null;
  // A team never billed has none, and the section and its chip then drop out.
  const [hasInvoices, setHasInvoices] = useState(true);
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

  // Reported as a fact to the link gate, which derives "subscribed" from it.
  useEffect(() => {
    if (wallet) onWalletLoaded?.(wallet);
  }, [wallet, onWalletLoaded]);

  // The SaaS session has lapsed and needs a re-sign-in (self-hosted only).

  const error = useMemo(() => {
    if (!walletError || sessionExpired) return null;
    if (walletError instanceof SaasUnconfiguredError)
      return walletError.message;
    if (walletError instanceof HttpError)
      return t(
        "portal.usage.error.walletUnavailable",
        "Wallet unavailable: {{status}} {{statusText}}",
        {
          status: walletError.status,
          statusText: walletError.statusText,
        },
      );
    return walletError instanceof Error
      ? walletError.message
      : String(walletError);
  }, [walletError, sessionExpired, t]);

  useEffect(() => {
    const onBillingUpdated = () => {
      void refreshWalletCache()
        .catch(() => {})
        .finally(refresh);
    };
    window.addEventListener("stirling:billing-updated", onBillingUpdated);
    return () =>
      window.removeEventListener("stirling:billing-updated", onBillingUpdated);
  }, [refresh]);
  const refreshAfterLicense = useCallback(() => {
    void refreshWalletCache()
      .catch(() => {})
      .then(() => {
        if (mounted.current) refresh();
      });
  }, [refresh]);
  const onInvoicesEmpty = useCallback(() => setHasInvoices(false), []);

  // The same flow the settings plan section uses, so there is one purchase implementation.
  // Optional on purpose: a build that mounts no provider must lose the door, not the page.
  const checkout = useCheckoutOptional();
  const heldLimit = wallet?.team?.held ? wallet.team.licensedUsers : null;
  const usersInUse = wallet?.team?.fleet
    ? fleetUsersInUse(
        wallet.team,
        accountLink?.status?.deviceId,
        localUsersInUse,
      )
    : localUsersInUse === undefined
      ? wallet?.team?.usersInUse
      : localUsersInUse;
  const addCapacity = useCallback(() => {
    const teamId = wallet?.teamId;
    // No email: the only one this instance holds is its local admin record, which is a Spring
    // username and not an address the buyer owns. The checkout asks for one instead.
    void checkout?.openCheckout("server", {
      combinedChoose: true,
      currentLimit: heldLimit,
      minimumSeats: usersInUse ?? undefined,
      resolveCurrency:
        teamId != null
          ? (preferredCurrency) =>
              fetchCheckoutPricing(teamId, "currency", preferredCurrency)
          : undefined,
      capacityNotice:
        !serverPlan &&
        !wallet?.team?.held &&
        localUsersInUse != null &&
        localUserLimit != null &&
        localUsersInUse > localUserLimit
          ? { users: localUsersInUse, limit: localUserLimit }
          : undefined,
      onSuccess: refresh,
    });
  }, [
    checkout,
    refresh,
    heldLimit,
    usersInUse,
    serverPlan,
    wallet?.team?.held,
    wallet?.teamId,
    localUsersInUse,
    localUserLimit,
  ]);

  const handledTeamRequest = useRef(false);
  useEffect(() => {
    if (searchParams.get("upgrade") !== "team") {
      handledTeamRequest.current = false;
      return;
    }
    if (
      handledTeamRequest.current ||
      !wallet ||
      !checkout ||
      (hasLocalInstance && localUsersInUse == null)
    )
      return;
    handledTeamRequest.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("upgrade");
    setSearchParams(next, { replace: true });
    if (
      wallet.role === "leader" &&
      !wallet.team?.held &&
      !serverPlan &&
      localUsersInUse != null &&
      localUserLimit != null &&
      localUsersInUse > localUserLimit
    )
      addCapacity();
  }, [
    searchParams,
    setSearchParams,
    wallet,
    checkout,
    localUsersInUse,
    localUserLimit,
    serverPlan,
    addCapacity,
    hasLocalInstance,
  ]);

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
          queryClient.setQueryData(qk.wallet(true), w);
          // Nudge the local instance to refresh its gate now so billable work
          // unblocks immediately rather than on its next poll. Fire-and-forget;
          // a no-op on SaaS (no local instance to sync).
          if (hasLocalInstance) triggerLocalSync().catch(() => {});
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
    refresh();
    return false;
  }, [queryClient, hasLocalInstance, refresh]);

  const enterpriseProcessor =
    Boolean(wallet?.enterprise) || serverPlan?.licenseType === "ENTERPRISE";
  const paying = Boolean(wallet?.processor?.active || wallet?.team?.held);
  const ownsLegacySubscription = legacyBilling.subscriptions.length > 0;
  const legacyTeamSubscription = legacyBilling.subscriptions.find(
    (subscription) => subscription.teamId === wallet?.teamId,
  );
  const recordedLegacyAllowance = legacyTeamSubscription?.teamAllowance;
  // A historical Pro personal team can record one seat; its first invitation grants the free allowance.
  const legacyTeamAllowance =
    recordedLegacyAllowance &&
    legacyTeamSubscription?.plan === "pro" &&
    recordedLegacyAllowance.maxUsers != null
      ? {
          ...recordedLegacyAllowance,
          maxUsers: Math.max(
            recordedLegacyAllowance.maxUsers,
            wallet?.freeUserAllowance ?? 0,
          ),
        }
      : recordedLegacyAllowance;

  return (
    <BillingScreen
      legacyTeamAllowance={legacyTeamAllowance ?? undefined}
      legacyPlan={
        legacyBilling.loading ||
        legacyBilling.loadError ||
        legacyBilling.subscriptions.length ? (
          <LegacySubscriptionPlan
            billing={legacyBilling}
            walletTeamId={wallet?.teamId ?? undefined}
          />
        ) : undefined
      }
      usersInUse={localUsersInUse}
      userLimit={localUserLimit}
      deviceId={accountLink?.status?.deviceId}
      headerAction={
        !needsRenewal &&
        (ownsLegacySubscription || (paying && wallet?.role === "leader")) ? (
          <Button
            fat
            variant="secondary"
            onClick={
              ownsLegacySubscription ? legacyBilling.openPortal : portal.open
            }
            disabled={
              ownsLegacySubscription ? legacyBilling.opening : portal.opening
            }
          >
            {t("payment.manageSubscription", "Manage subscription")}
          </Button>
        ) : undefined
      }
      wallet={wallet}
      unavailable={
        needsRenewal
          ? t(
              "portal.accountLink.renewal.dataUnavailable",
              "Your plan and usage will appear after you renew billing access. This server stays connected, and local document processing remains available.",
            )
          : undefined
      }
      serverPlan={serverPlan}
      serverPlanAction={serverPlanAction}
      loading={walletPending}
      pendingUnits={localUsage?.totalUnsyncedUnits ?? 0}
      notices={
        <>
          {wallet?.team?.held && wallet.role === "leader" && (
            <TeamSubscriptionChange refreshKey={walletReadAt} />
          )}
          {dealError && (
            <Banner
              tone="danger"
              title={t("portal.procurement.error.title")}
              action={
                <Button size="sm" onClick={() => void dealQuery.refetch()}>
                  {t("portal.accountLink.gate.retry", "Try again")}
                </Button>
              }
            >
              {dealError}
            </Banner>
          )}
          {sessionRecovery}

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
          {legacyBilling.portalError && (
            <Banner
              tone="danger"
              title={t(
                "portal.usage.error.openStripePortal",
                "Couldn't open Stripe portal",
              )}
            >
              {t(
                "legacyBilling.portalError",
                "We couldn't open Stripe billing. Please try again.",
              )}
            </Banner>
          )}
        </>
      }
      editorsDeployed={editorsDeployed}
      pdfsProcessed={fleetStats?.pdfsProcessed ?? null}
      licenseSection={renderLicenseSection?.(refreshAfterLicense)}
      onAddCapacity={
        !enterpriseProcessor && checkout && wallet?.role === "leader"
          ? addCapacity
          : undefined
      }
      onActivateProcessor={
        !enterpriseProcessor &&
        wallet?.role === "leader" &&
        !wallet?.processor?.active
          ? () =>
              setActivationStep(
                bundleFlow.status === "none" ? "choose" : "prepay",
              )
          : undefined
      }
      activateLabel={
        bundleFlow.status === "invoice"
          ? t("portal.billing.freePlan.payInvoice", "Pay invoice to complete")
          : bundleFlow.status === "quote"
            ? t("portal.billing.freePlan.viewQuote", "View quote")
            : undefined
      }
      onGovernSpend={
        !enterpriseProcessor &&
        wallet?.role === "leader" &&
        wallet?.processor?.active
          ? () => setAdjustingLimit(true)
          : undefined
      }
      procurementSection={
        deal?.dealId != null && deal.stage !== "exploring" ? (
          <DealStatusHero
            snapshot={deal}
            onOpen={isLeader ? openEnterprise : undefined}
          />
        ) : undefined
      }
      onEnterpriseQuote={
        isLeader &&
        dealQuery.isSuccess &&
        (deal?.dealId == null || deal.stage === "exploring")
          ? openEnterprise
          : undefined
      }
      paymentSection={
        paying || ownsLegacySubscription ? (
          <>
            {paying && wallet && (
              <PaymentSection
                pendingUnits={localUsage?.totalUnsyncedUnits ?? 0}
                wallet={wallet}
                onManage={wallet.role === "leader" ? portal.open : undefined}
                managing={portal.opening}
              />
            )}
            {legacyBilling.subscriptions.map((subscription) => (
              <KvRow
                key={subscription.id}
                label={t("portal.billing.payment.nextInvoice", "Next invoice")}
                note={
                  paying || legacyBilling.subscriptions.length > 1
                    ? subscription.plan === "pro"
                      ? t("legacyBilling.pro", "Pro (legacy)")
                      : t("legacyBilling.team", "Team (legacy)")
                    : undefined
                }
                value={
                  subscription.currentPeriodEnd &&
                  !Number.isNaN(Date.parse(subscription.currentPeriodEnd))
                    ? formatPeriodDate(subscription.currentPeriodEnd, {
                        year: true,
                      })
                    : t(
                        "portal.billing.payment.dateUnavailable",
                        "Billing date not available yet",
                      )
                }
              />
            ))}
          </>
        ) : undefined
      }
      invoicesSection={
        paying && hasInvoices ? (
          <InvoicesSection onEmpty={onInvoicesEmpty} />
        ) : undefined
      }
      extras={
        <>
          {!enterpriseProcessor && wallet && wallet.status === "free" && (
            <FreePlanView
              wallet={wallet}
              step={activationStep}
              onStepChange={setActivationStep}
              onSubscribed={confirmSubscription}
              onActivationClosed={bundleFlow.refresh}
            />
          )}

          {!enterpriseProcessor && wallet && wallet.status === "subscribed" && (
            <SubscribedPlanView
              pendingUnits={localUsage?.totalUnsyncedUnits ?? 0}
              wallet={wallet}
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
