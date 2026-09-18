/**
 * Hook backing the PAYG Plan page. Wraps {@code GET /api/v1/payg/wallet}
 * (served by {@code PaygWalletController} once Wave 1 BE lands; until then
 * the dev preview route synthesises a wallet from localStorage) and exposes
 * mutations for marking-subscribed and updating-the-cap.
 *
 * <h2>Render efficiency</h2>
 *
 * {@code Plan}, {@code PaygFreeLeader/Member} and {@code PaygLeader/Member}
 * re-render only on actual data change: the query client's structural sharing
 * reuses the previous snapshot when the payload is unchanged, and drops a
 * response superseded by a later one. The returned callbacks keep stable
 * identities, so {@code Plan} can pass {@code markSubscribed} to
 * {@code UpgradeModal} without forcing a remount.
 *
 * <h2>Mutation semantics</h2>
 *
 * Both {@code markSubscribed} and {@code updateCap} resolve only after the
 * post-mutation wallet refetch completes. So callers like the cap-editor
 * "Update cap" button that gate a {@code loading} state on the returned
 * promise see the UI flip exactly once the new state is visible — no
 * intermediate flash of the old value.
 *
 * <h2>Freshness</h2>
 *
 * The figures drain as metered work runs, so a mounted consumer re-reads the
 * wallet every {@link WALLET_POLL_MS} and again on returning to the tab once
 * they are stale. Those refreshes are silent: {@code loading} tracks "nothing
 * to show yet" rather than "a request is out", and a failure with a good
 * snapshot behind it never surfaces — so consumers that gate on those flags
 * don't flicker on a background tick.
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
import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { qk } from "@app/query/keys";
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
} from "@app/billing";

// ─── Public types ───────────────────────────────────────────────────────
// The wallet contract lives in @app/billing (shared with the admin portal).
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
 * How often a mounted consumer re-reads the wallet. Matches the app query
 * client's staleTime, so the sidebar meter and anything cached elsewhere age
 * out on the same clock.
 */
const WALLET_POLL_MS = 30_000;

/** Disabling clears the wallet and stops reads, including background polling. */
export function useWallet(enabled = true): UseWalletResult {
  // Resolved once: the dev-preview side-channel when rendered outside the real
  // app (saas /dev/payg-preview route), else null (every real build + desktop).
  // The detection + synthesis live behind the @app/hooks/walletDevPreview seam
  // because they read import.meta.env / window.location / localStorage, which
  // cloud/ may not touch directly.
  const devPreview = useRef(getWalletDevPreview()).current;

  const {
    data,
    isPending,
    error: readError,
    refetch: read,
  } = useQuery({
    queryKey: qk.paygWallet(),
    queryFn: async () =>
      devPreview
        ? devPreview.buildWallet(devPreview.role())
        : (await apiClient.get<Wallet>("/api/v1/payg/wallet")).data,
    enabled,
    // The dev-preview wallet is synthesised locally, so there is nothing to
    // re-read; a hidden tab pauses either way.
    refetchInterval: devPreview ? false : WALLET_POLL_MS,
    refetchOnWindowFocus: !devPreview,
    staleTime: WALLET_POLL_MS,
    // A failure self-heals on the next tick, so a retry only doubles the wait.
    retry: false,
  });

  // Disabling shows nothing, rather than the last team's figures.
  const wallet = enabled ? (data ?? null) : null;
  // A failed refresh with a snapshot behind it is a non-event: the figures
  // stand and the next tick self-heals. Only a failure that leaves nothing to
  // show surfaces.
  const surfaced = enabled && !wallet ? readError : null;

  // Once per failure, not once per tick, or an offline tab warns every poll.
  const warned = useRef(false);
  useEffect(() => {
    if (!surfaced) {
      warned.current = false;
      return;
    }
    if (warned.current) return;
    warned.current = true;
    console.warn("[useWallet] fetch failed", surfaced);
  }, [surfaced]);

  const refetch = useCallback(async () => {
    await read();
  }, [read]);

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
    // "Nothing to show yet", not "a request is out": a background tick must not
    // blink an open limit modal, which gates on `loading || !wallet`.
    loading: enabled && isPending,
    error: surfaced
      ? surfaced instanceof Error
        ? surfaced.message
        : "Failed to load wallet"
      : null,
    refetch,
    markSubscribed,
    updateCap,
    openPortal,
  };
}
