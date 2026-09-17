import { useSyncExternalStore } from "react";

/** Shared by the editor and Processor, including runs outside the portal HTTP client. */
export const FREE_TIER_EXHAUSTED_EVENT = "stirling:portal-free-tier-exhausted";

export type AccountLinkBlockReason =
  | "FREE_TIER_EXHAUSTED"
  | "OVER_LIMIT"
  | "REVOKED"
  | "GRACE_EXPIRED";
export type AccountLinkBlockSource = "foreground" | "background";

export interface AccountLinkBlockContext {
  pipelineId?: string;
  pipelineName?: string;
  fileName?: string;
  trigger: "upload" | "export" | "manual" | "automatic";
}

const PROMPT_SESSION_KEY = "stirling:credit-prompt-shown";
let shownInMemory = false;
let storageWriteFailed = false;
const EMPTY = {
  exhausted: false,
  promptPending: false,
  promptShown: false,
  context: undefined as AccountLinkBlockContext | undefined,
};
let state = EMPTY;
const listeners = new Set<() => void>();

function shownThisSession(): boolean {
  try {
    return (
      window.sessionStorage.getItem(PROMPT_SESSION_KEY) === "true" ||
      (storageWriteFailed && shownInMemory)
    );
  } catch {
    return shownInMemory;
  }
}

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

/** The first failed operation requests a dialog; route changes retain its cause. */
export function useAccountLinkBlock() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

/** Clears recovered exhaustion without rearming the automatic prompt in this tab session. */
export function clearAccountLinkBlock(): void {
  const promptShown = shownThisSession();
  if (
    state.exhausted ||
    state.promptPending ||
    state.context ||
    state.promptShown !== promptShown
  ) {
    publish({ ...EMPTY, promptShown });
  }
}

/** Coalesces failures across navigation and reloads; blocked storage falls back to this app lifetime. */
export function acknowledgeAccountLinkPrompt(): void {
  shownInMemory = true;
  try {
    window.sessionStorage.setItem(PROMPT_SESSION_KEY, "true");
  } catch {
    // Restricted webviews can deny storage; the in-memory suppression still applies.
    storageWriteFailed = true;
  }
  publish({ ...state, promptPending: false, promptShown: true });
}

/** Explicit CTA clicks can reopen the dialog after automatic prompts have been dismissed. */
export function requestAccountLinkPrompt(): void {
  publish({ ...state, promptPending: true, context: undefined });
}

/** Records a failed operation and preserves the first cause while its exhaustion notice is active. */
export function reportFreeTierExhausted(
  source: AccountLinkBlockSource = "foreground",
  context?: AccountLinkBlockContext,
): void {
  const promptShown = shownThisSession();
  const promptPending = state.promptPending || !promptShown;
  const cause = state.exhausted ? state.context : context;
  if (
    state.exhausted &&
    state.promptPending === promptPending &&
    state.context === cause
  )
    return;
  publish({ exhausted: true, promptPending, promptShown, context: cause });
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
  context?: AccountLinkBlockContext,
): boolean {
  if (classifyAccountLinkBlock(error) !== "FREE_TIER_EXHAUSTED") return false;
  reportFreeTierExhausted(source, context);
  return true;
}
