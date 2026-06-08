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
 * </ul>
 *
 * <h2>Dev preview fallback</h2>
 *
 * When the hook is rendered outside the saas app (e.g. on {@code
 * /dev/payg-preview}) the {@code AppConfigContext} provider is not mounted,
 * so the principal lookup throws. The hook detects that and silently
 * falls back to a synthesized snapshot with subscription state read from
 * {@code localStorage} (key {@code stirling.payg.devSubscription}). That
 * preserves the design-iteration workflow without a backend round-trip.
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
  refetch: () => void;
  /**
   * Dev-only side-channel that simulates the Stripe webhook flipping the
   * team to subscribed. Used by {@code UpgradeModal} when the backend is
   * running the mock checkout — the real flow waits for the webhook
   * instead and the next {@code refetch} picks up the change.
   */
  markSubscribed: (capUsd: number | null) => Promise<void>;
  /** Update the team's monthly cap. {@code null} means "no cap". */
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
 * Synthesize a wallet snapshot for the dev preview route. Mirrors the same
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (devPreview) {
        // Synthesize a snapshot so the dev preview route still works without auth.
        const synth = buildDevPreviewWallet(devPreviewRole());
        if (!cancelled) {
          setWallet((prev) => reuseIfEqual(prev, synth));
          setLoading(false);
        }
        return;
      }

      try {
        const res = await apiClient.get<Wallet>("/api/v1/payg/wallet");
        if (!cancelled) {
          setWallet((prev) => reuseIfEqual(prev, res.data));
        }
      } catch (e: unknown) {
        // eslint-disable-next-line no-console
        console.warn("[useWallet] fetch failed", e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load wallet");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [devPreview, refetchTick]);

  const refetch = useCallback(() => {
    setRefetchTick((t) => t + 1);
  }, []);

  const markSubscribed = useCallback(
    async (capUsd: number | null) => {
      if (devPreview) {
        // Flip the localStorage flag and refetch the synthesized snapshot.
        try {
          window.localStorage.setItem(STORAGE_KEY, "subscribed");
        } catch {
          /* storage unavailable */
        }
        refetch();
        return;
      }
      const noCap = capUsd === null;
      await apiClient.post("/api/v1/payg/dev/mark-subscribed", {
        capUsd: capUsd ?? 0,
        noCap,
      });
      refetch();
    },
    [devPreview, refetch],
  );

  const updateCap = useCallback(
    async (capUsd: number | null) => {
      const noCap = capUsd === null;
      if (devPreview) {
        // Cap edits in dev preview are no-ops on synthesized state.
        refetch();
        return;
      }
      await apiClient.patch("/api/v1/payg/cap", {
        capUsd: capUsd ?? 0,
        noCap,
      });
      refetch();
    },
    [devPreview, refetch],
  );

  return { wallet, loading, error, refetch, markSubscribed, updateCap };
}
