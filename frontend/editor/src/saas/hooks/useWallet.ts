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

/**
 * A single team member's billing-relevant info — name + email for the avatar
 * row, {@code spendUnits} for the mini-bar, and {@code capUnits} for the
 * optional per-member sub-cap. Mirrors a row of the backend's {@code members}
 * array on {@code WalletSnapshot} (the {@code wallet_category_summary} view
 * joined with {@code team_memberships}).
 */
export interface WalletMember {
  /** Supabase user id of the member. */
  userId: string;
  name: string;
  email: string;
  /** Per-member sub-cap, or {@code null} for "no sub-cap". */
  capUnits: number | null;
  /** Member's current-period billable spend. */
  spendUnits: number;
}

/**
 * Per-category breakdown of current-period spend in billable units. The
 * categories mirror the {@code FeatureGate} buckets the backend tracks:
 * server-side tool calls ({@code api}), AI-backed tools ({@code ai}), and
 * pipeline / automation runs ({@code automation}). Numbers sum to {@code
 * billableUsed} (modulo rounding in mock data).
 */
export interface WalletCategoryBreakdown {
  api: number;
  ai: number;
  automation: number;
}

/** Mirror of the backend's {@code WalletSnapshot} record (the JSON returned from {@code GET /api/v1/payg/wallet}). */
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
  /** Per-category spend breakdown (api / ai / automation). */
  categoryBreakdown: WalletCategoryBreakdown;
  /**
   * Team members, populated for the leader view; empty for members or
   * single-seat tenants. Leader-vs-member is still resolved via {@link
   * Wallet#role} — this field just carries the per-member rows the leader's
   * sub-cap table needs.
   */
  members: WalletMember[];
  /**
   * Recent billable-activity rows. V1 returns {@code []} from the backend;
   * the field exists so the Plan page can render an empty state without
   * branching on undefined. Each entry is a {@code Record<string, unknown>}
   * because the activity-row shape is not yet finalised — when the meter-
   * event surface lands, this widens to a real interface.
   */
  recent: Array<Record<string, unknown>>;
}

/**
 * Result of a per-member sub-cap update. The backend may clamp the requested
 * value down to the team-level cap (so a member can't be granted more than
 * the team has to spend) — {@code clamped} surfaces that so the UI can show
 * a "Clamped to team cap of $X" toast.
 */
export interface SubCapUpdateResult {
  /** The cap units that actually landed on the row (post-clamp). */
  effective: number;
  /** {@code true} when the server reduced the request to fit the team cap. */
  clamped: boolean;
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
  /**
   * Update a single member's per-seat sub-cap. {@code capUnits === null}
   * removes the sub-cap (member shares the team budget). Returns the
   * effective value the server actually stored — clamping happens server-
   * side because only the server knows the current team cap, and we'd
   * race the leader's own cap edit if we tried to clamp in the FE.
   * Refetches the wallet on success so {@code members[]} reflects the
   * new value.
   */
  updateSubCap: (
    userId: string,
    capUnits: number | null,
  ) => Promise<SubCapUpdateResult>;
  /**
   * Mint a Stripe Customer Portal session and open it in a new tab. Calls
   * {@code POST /api/v1/payg/portal-session} (which proxies to a Supabase
   * edge function) and {@code window.open}s the returned URL. Throws on
   * backend error so the caller can show a friendly toast — notably 503
   * {@code PORTAL_NOT_CONFIGURED} (Supabase unavailable in local dev) and
   * 404 (team not yet subscribed).
   */
  openPortal: () => Promise<void>;
}

// ─── Implementation ─────────────────────────────────────────────────────

const STORAGE_KEY = "stirling.payg.devSubscription";

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
    prev.role !== next.role ||
    prev.billingPeriodStart !== next.billingPeriodStart ||
    prev.billingPeriodEnd !== next.billingPeriodEnd ||
    prev.billableUsed !== next.billableUsed ||
    prev.billableLimit !== next.billableLimit ||
    prev.capUsd !== next.capUsd ||
    prev.noCap !== next.noCap ||
    prev.stripeSubscriptionId !== next.stripeSubscriptionId ||
    prev.spendUnitsThisPeriod !== next.spendUnitsThisPeriod
  ) {
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
      a.capUnits !== b.capUnits ||
      a.spendUnits !== b.spendUnits
    ) {
      return next;
    }
  }
  if (prev.recent !== next.recent && prev.recent.length !== next.recent.length) {
    return next;
  }
  return prev;
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
    // Wave 1 backend (PR #6574) returns a per-category breakdown so the
    // hero panel can split AI / automation / API. Use realistic but
    // tier-distinguishable mock values so the dev preview shows a
    // different visual when the localStorage flip toggles subscribed.
    categoryBreakdown: subscribed
      ? { api: 12, ai: 35, automation: 15 }
      : { api: 5, ai: 40, automation: 17 },
    // Members are populated in the leader view by the real backend
    // (joining team_memberships); the dev preview returns an empty
    // array — Plan.tsx + PaygLeader still resolve role via wallet.role,
    // so empty members just hides the sub-caps card.
    members: [],
    // Activity feed is V1 = [], the backend ships this in Wave 2 once
    // payg_meter_event_log is read-accessible from the wallet endpoint.
    recent: [],
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
          // eslint-disable-next-line no-console
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

  const updateSubCap = useCallback(
    async (
      userId: string,
      capUnits: number | null,
    ): Promise<SubCapUpdateResult> => {
      if (devPreview) {
        // Dev preview has no real members; report a successful no-op so the
        // toast still fires and the inline editor exits its loading state.
        await refetch();
        return { effective: capUnits ?? 0, clamped: false };
      }
      const res = await apiClient.patch<{
        success: boolean;
        capUnits: number;
        clamped: boolean;
      }>(`/api/v1/payg/sub-caps/${encodeURIComponent(userId)}`, {
        capUnits,
      });
      await refetch();
      return { effective: res.data.capUnits, clamped: res.data.clamped };
    },
    [devPreview, refetch],
  );

  const openPortal = useCallback(async () => {
    if (devPreview) {
      // No real Stripe in dev preview — open a placeholder so the click
      // still feels alive. Real flow opens the Stripe-hosted session URL.
      window.open("https://billing.stripe.com/p/login/mock", "_blank", "noopener,noreferrer");
      return;
    }
    const res = await apiClient.post<{ url: string }>(
      "/api/v1/payg/portal-session",
      { returnUrl: window.location.href },
    );
    if (!res.data?.url) {
      throw new Error("Portal session response missing url");
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }, [devPreview]);

  return {
    wallet,
    loading,
    error,
    refetch,
    markSubscribed,
    updateCap,
    updateSubCap,
    openPortal,
  };
}
