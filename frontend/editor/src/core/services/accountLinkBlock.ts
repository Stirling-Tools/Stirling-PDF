import { useSyncExternalStore } from "react";

/** Shared by the editor and Processor, including runs outside the portal HTTP client. */
export const FREE_TIER_EXHAUSTED_EVENT = "stirling:portal-free-tier-exhausted";

export type AccountLinkBlockReason =
  | "FREE_TIER_EXHAUSTED"
  | "OVER_LIMIT"
  | "REVOKED"
  | "GRACE_EXPIRED";
export type AccountLinkBlockSource = "foreground" | "background";

const EMPTY = { exhausted: false, promptPending: false, promptShown: false };
let state = EMPTY;
const listeners = new Set<() => void>();

function publish(next: typeof state): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Exhaustion survives route changes; only a foreground failure requests a dialog. */
export function useAccountLinkBlock() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

/** Call after a successful link or an authoritative balance refresh restores local credits. */
export function clearAccountLinkBlock(): void {
  if (state !== EMPTY) publish(EMPTY);
}

/** Coalesces concurrent failures and keeps dismissed prompts quiet until credits are restored. */
export function acknowledgeAccountLinkPrompt(): void {
  publish({ ...state, promptPending: false, promptShown: true });
}

/** Explicit CTA clicks can reopen the dialog after automatic prompts have been dismissed. */
export function requestAccountLinkPrompt(): void {
  publish({ ...state, promptPending: true });
}

/** Records an authoritative exhaustion signal. Background jobs never interrupt foreground work. */
export function reportFreeTierExhausted(
  source: AccountLinkBlockSource = "foreground",
): void {
  const promptPending =
    state.promptPending || (source === "foreground" && !state.promptShown);
  if (state.exhausted && state.promptPending === promptPending) return;
  publish({ ...state, exhausted: true, promptPending });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(FREE_TIER_EXHAUSTED_EVENT, { detail: { source } }),
    );
  }
}

/** Accepts parsed portal errors and Axios errors; unrelated 402s fall through. */
export function classifyAccountLinkBlock(
  error: unknown,
): AccountLinkBlockReason | null {
  if (!error || typeof error !== "object") return null;
  const failure = error as {
    status?: unknown;
    body?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  if ((failure.response?.status ?? failure.status) !== 402) return null;
  const body = failure.response?.data ?? failure.body;
  if (!body || typeof body !== "object") return null;
  const { error: sentinel, reason } = body as {
    error?: unknown;
    reason?: unknown;
  };
  if (sentinel !== "ACCOUNT_LINK_REQUIRED") return null;
  switch (reason) {
    case "FREE_TIER_EXHAUSTED":
    case "OVER_LIMIT":
    case "REVOKED":
    case "GRACE_EXPIRED":
      return reason;
    default:
      return null;
  }
}

/** Returns whether this is a spent local allowance, so callers can suppress generic errors. */
export function reportAccountLinkBlock(
  error: unknown,
  source: AccountLinkBlockSource = "foreground",
): boolean {
  if (classifyAccountLinkBlock(error) !== "FREE_TIER_EXHAUSTED") return false;
  reportFreeTierExhausted(source);
  return true;
}
