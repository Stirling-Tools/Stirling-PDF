/**
 * Bridge for usage-limit (PAYG 402) signals raised by server-side runs — the policy auto-run path
 * and the AI agent — neither of which flows through the apiClient interceptor that pops the
 * usage-limit modal for direct calls. Their tool calls execute server-side, so the blocking 402
 * never reaches the browser's HTTP client.
 *
 * Proprietary code can't import the saas modal API (layering: proprietary ↛ saas), so it broadcasts
 * this window event instead; the saas-layer UsageLimitModalHost listens and opens the matching
 * modal (free → "subscribe", subscribed → "raise cap"). Kept here (proprietary) so both layers
 * share one name.
 */
export const PAYG_LIMIT_REACHED_EVENT = "payg:limitReached";

/** Detail carried on {@link PAYG_LIMIT_REACHED_EVENT}. */
export interface PaygLimitReachedDetail {
  /**
   * Whether the blocked team was subscribed (over its spending cap) vs un-subscribed (free
   * allowance spent), from the blocking 402. The listener uses it to choose the spend-cap vs
   * free-limit modal. Null when unknown → treat as free-limit.
   */
  subscribed: boolean | null;
}

/** Fire {@link PAYG_LIMIT_REACHED_EVENT}. No-op outside a browser (tests / SSR). */
export function dispatchPaygLimitReached(subscribed: boolean | null): void {
  try {
    window.dispatchEvent(
      new CustomEvent<PaygLimitReachedDetail>(PAYG_LIMIT_REACHED_EVENT, {
        detail: { subscribed },
      }),
    );
  } catch {
    // non-browser env (tests / SSR) — no-op.
  }
}
