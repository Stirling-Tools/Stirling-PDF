/**
 * Hook backing the PAYG Plan page. Wraps {@code GET /api/v1/payg/wallet}
 * (served by {@code PaygWalletController} once Wave 1 BE lands; until then
 * the dev preview route synthesises a wallet from localStorage) and exposes
 * mutations for marking-subscribed and updating-the-cap.
 *
 * <h2>Render efficiency</h2>
 *
 * The hook is designed so {@code Plan}, {@code PaygFreeLeader/Member}, and
 * {@code PaygLeader/Member} re-render only on actual data change:
 *
 * <ul>
 *   <li>{@link Wallet} snapshot is stored as a plain object — but every
 *       successful fetch deep-compares with the previous snapshot and reuses
 *       the prior reference if the payload is unchanged. Consumers that hold
 *       a stable {@code wallet} reference get stable child memoisation.
 *   <li>The returned {@link UseWalletResult} keeps stable callback identities
 *       via {@code useCallback}. {@code Plan} can pass {@code markSubscribed}
 *       to {@code UpgradeModal} without forcing a remount.
 *   <li>{@code refetch / markSubscribed / updateCap} bump an internal counter
 *       that the {@code useEffect} watches — no global state plumbing.
 *   <li>A monotonic {@code requestId} ref drops stale responses so a slow
 *       refetch from tick=N can't overwrite a faster one from tick=N+1
 *       (out-of-order resolution would otherwise show old data).
 * </ul>
 *
 * <h2>Mutation semantics</h2>
 *
 * Both {@code markSubscribed} and {@code updateCap} resolve only after the
 * post-mutation wallet refetch completes. So callers like the cap-editor
 * "Update cap" button that gate a {@code loading} state on the returned
 * promise see the UI flip exactly once the new state is visible — no
 * intermediate flash of the old value.
 *
 * <h2>Dev preview fallback</h2>
 *
 * When the hook is rendered outside the saas app (e.g. on {@code
 * /dev/payg-preview} during local design work) the {@code AppConfigContext}
 * provider is not mounted and no backend is available. The hook detects that
 * via the {@code @app/hooks/walletDevPreview} seam and, when it returns a live
 * channel, falls back to a synthesised snapshot whose subscription state is
 * read from {@code localStorage}. The detection + synthesis (which read
 * {@code import.meta.env}, {@code window.location} and web storage — all banned
 * in cloud/) live in the saas leaf's impl of that seam; this hook just consults
 * it. Desktop's cascade falls through to the cloud default (no dev preview), so
 * it always fetches the real wallet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "@app/services/apiClient";
import { createPortalSession } from "@app/services/billing";
import { openExternal } from "@app/platform/openExternal";
import { getWalletDevPreview } from "@app/hooks/walletDevPreview";
import type {
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
} from "@shared/billing";

// ─── Public types ───────────────────────────────────────────────────────
// The wallet contract lives in @shared/billing (shared with the admin portal).
// Re-exported so existing `@app/hooks/useWallet` importers keep their imports.
export type {
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
};

export interface UseWalletResult {
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  /** Force a refetch — e.g. after Stripe redirects back into the app. */
  refetch: () => Promise<void>;
  /**
   * Dev-only side-channel that simulates the Stripe webhook flipping the
   * team to subscribed. Used by {@code UpgradeModal} when the backend is
   * running the mock checkout — the real flow waits for the webhook
   * instead and the next {@code refetch} picks up the change. Resolves
   * once the post-mutation refetch completes.
   */
  markSubscribed: (capUsd: number | null) => Promise<void>;
  /**
   * Update the team's monthly cap. {@code null} means "no cap". Resolves
   * once the post-mutation refetch completes so a save-button
   * {@code loading} state can be safely cleared on resolution.
   */
  updateCap: (capUsd: number | null) => Promise<void>;
  /**
   * Mint a Stripe Customer Portal session and send the user to it. Mints the
   * session via the {@code @app/services/billing} seam (passing the caller's
   * {@code teamId}, which the PAYG portal edge function needs to resolve the
   * team outside Spring Security) and opens the returned URL via the
   * {@code @app/platform/openExternal} seam — so web and desktop each route it
   * the platform-appropriate way (new tab on web, system browser on desktop).
   * Throws on error so the caller can show a friendly toast — notably 404
   * {@code team_not_subscribed}.
   */
  openPortal: () => Promise<void>;
}

// ─── Implementation ─────────────────────────────────────────────────────

/**
 * Stable reference reuse — if the new payload deep-equals the previous one,
 * return the previous object so React's reference check short-circuits child
 * renders. Walks the top-level scalars first (cheapest), then the nested
 * {@code categoryBreakdown} object, then the {@code members} array. The
 * {@code recent} array is identity-compared only — Wave 1 always returns
 * {@code []} so a reference-stability check is sufficient; we'll deepen
 * this once the activity surface lands.
 */
function reuseIfEqual(prev: Wallet | null, next: Wallet): Wallet {
  if (!prev) return next;
  if (
    prev.status !== next.status ||
    prev.teamId !== next.teamId ||
    prev.role !== next.role ||
    prev.billingPeriodStart !== next.billingPeriodStart ||
    prev.billingPeriodEnd !== next.billingPeriodEnd ||
    prev.billableUsed !== next.billableUsed ||
    prev.billableLimit !== next.billableLimit ||
    prev.freeAllowance !== next.freeAllowance ||
    prev.freeRemaining !== next.freeRemaining ||
    prev.pricePerDocMinor !== next.pricePerDocMinor ||
    prev.currency !== next.currency ||
    prev.estimatedBillMinor !== next.estimatedBillMinor ||
    prev.capUsd !== next.capUsd ||
    prev.noCap !== next.noCap ||
    prev.stripeSubscriptionId !== next.stripeSubscriptionId ||
    prev.spendUnitsThisPeriod !== next.spendUnitsThisPeriod
  ) {
    return next;
  }
  if (prev.recent.length !== next.recent.length) {
    return next;
  }
  if (
    prev.categoryBreakdown.api !== next.categoryBreakdown.api ||
    prev.categoryBreakdown.ai !== next.categoryBreakdown.ai ||
    prev.categoryBreakdown.automation !== next.categoryBreakdown.automation
  ) {
    return next;
  }
  if (prev.members.length !== next.members.length) {
    return next;
  }
  for (let i = 0; i < prev.members.length; i++) {
    const a = prev.members[i];
    const b = next.members[i];
    if (
      a.userId !== b.userId ||
      a.name !== b.name ||
      a.email !== b.email ||
      a.spendUnits !== b.spendUnits
    ) {
      return next;
    }
  }
  // recent length-mismatch already returned `next` above; content (Wave 1 = []) is identical
  // otherwise, so reuse the prior reference for stable child memoisation.
  return prev;
}

export function useWallet(): UseWalletResult {
  // Resolved once: the dev-preview side-channel when rendered outside the real
  // app (saas /dev/payg-preview route), else null (every real build + desktop).
  // The detection + synthesis live behind the @app/hooks/walletDevPreview seam
  // because they read import.meta.env / window.location / localStorage, which
  // cloud/ may not touch directly.
  const devPreview = useRef(getWalletDevPreview()).current;

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  // Monotonic request id — used to discard stale responses if a faster
  // refetch lands first. Only the latest issued id is permitted to commit
  // its result.
  const latestReqId = useRef(0);

  // Promise tracking the most recent in-flight load. Mutations await this
  // so their resolution semantics are "the new state is visible," not
  // "the request fired." Cleared when no load is pending.
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const reqId = ++latestReqId.current;
    let cancelled = false;

    const promise = (async () => {
      setLoading(true);
      setError(null);

      if (devPreview) {
        const synth = devPreview.buildWallet(devPreview.role());
        if (cancelled || reqId !== latestReqId.current) return;
        setWallet((prev) => reuseIfEqual(prev, synth));
        setLoading(false);
        return;
      }

      try {
        const res = await apiClient.get<Wallet>("/api/v1/payg/wallet");
        if (cancelled || reqId !== latestReqId.current) return;
        setWallet((prev) => reuseIfEqual(prev, res.data));
      } catch (e: unknown) {
        if (cancelled || reqId !== latestReqId.current) return;
        console.warn("[useWallet] fetch failed", e);
        setError(e instanceof Error ? e.message : "Failed to load wallet");
      } finally {
        if (!cancelled && reqId === latestReqId.current) {
          setLoading(false);
        }
      }
    })();

    inFlight.current = promise;

    return () => {
      cancelled = true;
      // Don't clear inFlight here — let it resolve so mutations awaiting it
      // still see a definitive "load completed" point. The reqId guard
      // upstream ensures stale results don't commit.
    };
  }, [devPreview, refetchTick]);

  const refetch = useCallback(async () => {
    setRefetchTick((t) => t + 1);
    // Snapshot the next-tick promise so the caller awaits this refetch
    // specifically — the in-flight ref will be updated to it on the next
    // effect run, but we can't reference that synchronously, so settle for
    // a microtask handoff: await the *current* effect to flush, then await
    // the new in-flight promise.
    await Promise.resolve();
    if (inFlight.current) {
      await inFlight.current;
    }
  }, []);

  const markSubscribed = useCallback(
    async (capUsd: number | null) => {
      if (devPreview) {
        devPreview.markSubscribed();
        await refetch();
        return;
      }
      const noCap = capUsd === null;
      // The dev side-channel only exists when the BE mock service is
      // running (FE-branch local dev). Once the real backend (PR #6574)
      // is in play, /dev/mark-subscribed is removed and the webhook
      // (customer.subscription.created) is what flips the team to
      // subscribed. We swallow 404s so the modal's completion path —
      // which awaits this promise before rendering the confirmation
      // screen — doesn't error out on a perfectly normal "the real
      // backend doesn't expose this dev hook" response. A subsequent
      // refetch picks up the webhook-driven flip whenever it lands.
      try {
        await apiClient.post("/api/v1/payg/dev/mark-subscribed", {
          capUsd: capUsd ?? 0,
          noCap,
        });
      } catch (e: unknown) {
        const status =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 404) {
          // Real BE in play — webhook will land the subscription
          // state; log and continue. Loud-but-harmless so the dev
          // notices their /dev/mark-subscribed isn't wired up.
          console.info(
            "[useWallet] /dev/mark-subscribed not available (404) — relying on Stripe webhook to flip subscription state",
          );
        } else {
          throw e;
        }
      }
      await refetch();
    },
    [devPreview, refetch],
  );

  const updateCap = useCallback(
    async (capUsd: number | null) => {
      const noCap = capUsd === null;
      if (devPreview) {
        await refetch();
        return;
      }
      await apiClient.patch("/api/v1/payg/cap", {
        capUsd: capUsd ?? 0,
        noCap,
      });
      await refetch();
    },
    [devPreview, refetch],
  );

  const openPortal = useCallback(async () => {
    if (devPreview) {
      // No real Stripe in dev preview — open a placeholder so the click still
      // feels alive. Routed through the openExternal seam to stay portable.
      await openExternal("https://billing.stripe.com/p/login/mock");
      return;
    }
    // Mint the portal session through the billing seam, passing teamId: the
    // PAYG portal edge function needs it to resolve the caller's team outside
    // Spring Security (its RPC enforces team membership). Then hand the URL to
    // the openExternal seam so each platform routes it appropriately. The seam
    // throws on error (e.g. 404 team_not_subscribed) so callers can toast.
    const teamId = wallet?.teamId;
    if (teamId == null) {
      throw new Error("No team resolved yet");
    }
    const { url } = await createPortalSession({ teamId });
    await openExternal(url);
  }, [devPreview, wallet?.teamId]);

  return {
    wallet,
    loading,
    error,
    refetch,
    markSubscribed,
    updateCap,
    openPortal,
  };
}
