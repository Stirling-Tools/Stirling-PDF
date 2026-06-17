/**
 * saas (web) implementation of the @app/hooks/walletDevPreview seam.
 *
 * Houses the PAYG dev-preview side-channel that {@code useWallet} used to carry
 * inline. It synthesises a wallet snapshot from {@code localStorage} when the
 * hook is rendered outside the real saas app (the {@code /dev/payg-preview}
 * route during local design work), where {@code AppConfigContext} is not mounted
 * and no backend is available. This is the only place the banned-in-cloud reads
 * ({@code import.meta.env.DEV}, {@code window.location}, {@code localStorage})
 * live — cloud reaches them through {@link getWalletDevPreview}.
 *
 * Behaviour preserved verbatim from the pre-move saas useWallet:
 *  - both {@code import.meta.env.DEV} AND a {@code /dev/} path are required, so a
 *    production tenant whose URL happens to start with {@code /dev/} can't hit
 *    the fallback;
 *  - subscription state is read from / written to {@code localStorage} so the
 *    modal's "mark subscribed" action survives a reload.
 */
import type { Wallet, WalletRole } from "@app/hooks/useWallet";
import type { WalletDevPreview } from "@cloud/hooks/walletDevPreview";

export type { WalletDevPreview } from "@cloud/hooks/walletDevPreview";

const STORAGE_KEY = "stirling.payg.devSubscription";

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
    teamId: null,
    status: subscribed ? "subscribed" : "free",
    role,
    billingPeriodStart: isoDay(periodStart),
    billingPeriodEnd: isoDay(periodEnd),
    billableUsed: 62,
    billableLimit: subscribed ? 1250 : 500,
    freeAllowance: 500,
    // One-time grant: a free team has used 62 of 500 (438 left); the dev
    // subscribed team is shown with its grant fully spent (kept across the
    // subscribe — it just no longer gates them).
    freeRemaining: subscribed ? 0 : 438,
    // Free teams also carry a rate now — the backend resolves it from the
    // default policy's USD Price so the upgrade-flow cap estimate ("≈ N paid
    // PDFs/month") can render before subscribing. Mirror that here.
    pricePerDocMinor: 2,
    currency: "usd",
    estimatedBillMinor: subscribed ? 0 : null,
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

/**
 * Resolve the active dev-preview side-channel, or {@code null} when we're in a
 * real build / on a real route (the common case). Both {@code import.meta.env.DEV}
 * and a {@code /dev/} path must hold.
 */
export function getWalletDevPreview(): WalletDevPreview | null {
  if (!isDevPreviewContext()) return null;
  return {
    buildWallet: buildDevPreviewWallet,
    role: devPreviewRole,
    markSubscribed: () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, "subscribed");
      } catch {
        /* storage unavailable */
      }
    },
  };
}
