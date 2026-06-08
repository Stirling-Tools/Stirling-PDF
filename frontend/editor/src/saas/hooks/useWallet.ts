/**
 * Hook backing the PAYG Plan page. Wraps {@code GET /api/v1/payg/wallet} (the
 * backend mock-service in {@code PaygApiService}) and exposes mutations for
 * marking-subscribed and updating-the-cap.
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
 * via {@code import.meta.env.DEV} + the {@code /dev/} path and falls back to
 * a synthesised snapshot whose subscription state is read from
 * {@code localStorage} (key {@code stirling.payg.devSubscription}). Both
 * conditions are required so a production tenant whose URL happens to start
 * with {@code /dev/} can't trigger the fallback.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "@app/services/apiClient";

// ─── Public types ───────────────────────────────────────────────────────

export type WalletStatus = "free" | "subscribed";
export type WalletRole = "leader" | "member";

/** Mirror of {@code PaygApiService.WalletSnapshot} (the JSON the backend returns). */
export interface Wallet {
  status: WalletStatus;
  role: WalletRole;
  /** ISO yyyy-mm-dd. */
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** Automation + AI + API operations used this cycle. */
  billableUsed: number;
  /** Free-tier ceiling. 500 in V1. */
  billableLimit: number;
  /** USD cap when subscribed; null when noCap or status=='free'. */
  capUsd: number | null;
  /** Only meaningful when status=='subscribed'. */
  noCap: boolean;
  /** Stripe subscription id when subscribed; null when free. */
  stripeSubscriptionId: string | null;
  /** Current-period spend in billable units. */
  spendUnitsThisPeriod: number;
}

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
}

// ─── Implementation ─────────────────────────────────────────────────────

const STORAGE_KEY = "stirling.payg.devSubscription";

/**
 * Stable reference reuse — if the new payload deep-equals the previous one,
 * return the previous object so React's reference check short-circuits child
 * renders. Cheap because Wallet is a small flat record (no nested objects /
 * arrays in V1).
 */
function reuseIfEqual(prev: Wallet | null, next: Wallet): Wallet {
  if (!prev) return next;
  if (
    prev.status === next.status &&
    prev.role === next.role &&
    prev.billingPeriodStart === next.billingPeriodStart &&
    prev.billingPeriodEnd === next.billingPeriodEnd &&
    prev.billableUsed === next.billableUsed &&
    prev.billableLimit === next.billableLimit &&
    prev.capUsd === next.capUsd &&
    prev.noCap === next.noCap &&
    prev.stripeSubscriptionId === next.stripeSubscriptionId &&
    prev.spendUnitsThisPeriod === next.spendUnitsThisPeriod
  ) {
    return prev;
  }
  return next;
}

/**
 * Synthesise a wallet snapshot for the dev preview route. Mirrors the same
 * shape the backend returns. Subscription state comes from localStorage so
 * the modal's "mark subscribed" action survives a reload.
 */
function buildDevPreviewWallet(role: WalletRole): Wallet {
  const subscribed =
    typeof window !== "undefined" &&
    (() => {
      try {
        return window.localStorage.getItem(STORAGE_KEY) === "subscribed";
      } catch {
        return false;
      }
    })();

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  return {
    status: subscribed ? "subscribed" : "free",
    role,
    billingPeriodStart: isoDay(periodStart),
    billingPeriodEnd: isoDay(periodEnd),
    billableUsed: 62,
    billableLimit: 500,
    capUsd: subscribed ? 25 : null,
    noCap: false,
    stripeSubscriptionId: subscribed ? "sub_devpreview" : null,
    spendUnitsThisPeriod: 62,
  };
}

/** True when we're rendered outside the real saas app (e.g. dev preview route). */
function isDevPreviewContext(): boolean {
  // Both checks required: production builds drop the path check, so a real
  // tenant whose URL begins with /dev/ can't accidentally hit the synthesised
  // fallback.
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/dev/");
}

/** Best-effort role read for dev preview — flips per query string ?role=member. */
function devPreviewRole(): WalletRole {
  if (typeof window === "undefined") return "leader";
  const url = new URL(window.location.href);
  return url.searchParams.get("role") === "member" ? "member" : "leader";
}

export function useWallet(): UseWalletResult {
  const devPreview = useRef<boolean>(isDevPreviewContext()).current;

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
        const synth = buildDevPreviewWallet(devPreviewRole());
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
        // eslint-disable-next-line no-console
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
        try {
          window.localStorage.setItem(STORAGE_KEY, "subscribed");
        } catch {
          /* storage unavailable */
        }
        await refetch();
        return;
      }
      const noCap = capUsd === null;
      await apiClient.post("/api/v1/payg/dev/mark-subscribed", {
        capUsd: capUsd ?? 0,
        noCap,
      });
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

  return { wallet, loading, error, refetch, markSubscribed, updateCap };
}
