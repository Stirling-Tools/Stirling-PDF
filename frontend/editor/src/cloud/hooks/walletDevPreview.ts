/**
 * Wallet dev-preview seam (@app/hooks/walletDevPreview).
 *
 * The cloud/ layer is the SHARED hosted experience consumed by BOTH the saas
 * (web) and desktop (Tauri) leaves, so it must stay platform-portable: it can't
 * read {@code import.meta.env}, {@code window.location} or web storage directly
 * (the cloud ESLint guardrail enforces this). The PAYG dev-preview route
 * ({@code /dev/payg-preview}) is a saas-only local-design affordance that
 * synthesises a wallet from {@code localStorage} when the real backend isn't
 * mounted — all three of those banned reads. {@link useWallet} reaches that
 * affordance through this seam instead.
 *
 * This module is the DEFAULT + the shared TypeScript contract: it reports
 * "not a dev preview" so the real backend fetch always runs. The saas leaf
 * shadows it with saas/hooks/walletDevPreview.ts, which supplies the synthesis;
 * desktop has no dev-preview route, so the cascade falls through to this
 * default. Returning {@code null} from {@link getWalletDevPreview} is the
 * canonical "no dev preview active" signal.
 */
import type { Wallet, WalletRole } from "@app/hooks/useWallet";

/**
 * The dev-preview side-channel {@link useWallet} consumes when rendered outside
 * the real app (the saas {@code /dev/payg-preview} route). When active it stands
 * in for the backend: {@link buildWallet} synthesises the snapshot and
 * {@link markSubscribed} flips the simulated subscription state. {@code null}
 * (the cloud default + every desktop build) means "no dev preview — fetch the
 * real wallet".
 */
export interface WalletDevPreview {
  /** Synthesise the dev-preview wallet snapshot (subscription state from storage). */
  buildWallet: (role: WalletRole) => Wallet;
  /** Best-effort role read for the preview — flips per {@code ?role=member}. */
  role: () => WalletRole;
  /** Flip the simulated subscription state to subscribed (persisted across reload). */
  markSubscribed: () => void;
}

/**
 * Resolve the active dev-preview side-channel, or {@code null} when we're in a
 * real build / on a real route. The cloud default + desktop always return
 * {@code null}; the saas leaf returns a live channel only on the dev route.
 */
export function getWalletDevPreview(): WalletDevPreview | null {
  return null;
}
