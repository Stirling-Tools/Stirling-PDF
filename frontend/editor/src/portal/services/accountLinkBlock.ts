/**
 * The self-hosted instance's `402 ACCOUNT_LINK_REQUIRED` sentinel, turned into a prompt.
 *
 * <p>Reactive by design. The free tier works with no Stirling account, so the UI cannot know in
 * advance whether an action is affordable, and it must not ask on the chance that it isn't: it runs
 * the action and lets the server's answer raise the dialog. The balance is not readable here either
 * way, since {@code GET /api/v1/account-link/free-tier} is admin-only and the portal is reachable
 * by a non-admin holding a PORTAL grant.
 *
 * <p>Only {@code FREE_TIER_EXHAUSTED} is acted on. It is the one reason that belongs to an unlinked
 * instance, so linking is a real answer to it; the others ({@code OVER_LIMIT}, {@code REVOKED},
 * {@code GRACE_EXPIRED}) mean a linked team's cloud wallet is the problem, and offering to link an
 * already-linked instance would be nonsense. Those fall through to the caller's own error handling.
 *
 * <p>Classifier and dispatcher are separate so the parsing can be tested without the modal.
 */

/** Bridge event to the always-mounted host in PortalProviders. Not part of the public API. */
export const FREE_TIER_EXHAUSTED_EVENT = "stirling:portal-free-tier-exhausted";

/**
 * Block reasons the instance entitlement gate returns alongside the sentinel. Mirrors the
 * backend {@code GateDecision.Reason} blocking arm.
 */
export type AccountLinkBlockReason =
  | "FREE_TIER_EXHAUSTED"
  | "OVER_LIMIT"
  | "REVOKED"
  | "GRACE_EXPIRED";

const BLOCK_REASONS: readonly string[] = [
  "FREE_TIER_EXHAUSTED",
  "OVER_LIMIT",
  "REVOKED",
  "GRACE_EXPIRED",
];

/**
 * The gate's block reason, or null when this is not the account-link sentinel.
 *
 * <p>Strict on both the status and the `error` sentinel, so an incidental 402 from anywhere else is
 * not hijacked into a link prompt. Reads {@link HttpError}'s shape structurally rather than by
 * {@code instanceof}, which keeps this off the import cycle with the client that reports to it.
 */
export function classifyAccountLinkBlock(
  error: unknown,
): AccountLinkBlockReason | null {
  if (!error || typeof error !== "object") return null;
  if ((error as { status?: unknown }).status !== 402) return null;
  const body = (error as { body?: unknown }).body;
  if (!body || typeof body !== "object") return null;
  const sentinel = (body as { error?: unknown }).error;
  if (sentinel !== "ACCOUNT_LINK_REQUIRED") return null;
  const reason = (body as { reason?: unknown }).reason;
  if (typeof reason !== "string" || !BLOCK_REASONS.includes(reason)) {
    return null;
  }
  return reason as AccountLinkBlockReason;
}

/**
 * Raises the "allowance spent" prompt if {@code error} is a spent free grant. Returns whether it
 * did, so a caller can leave its own error surface alone when the dialog has taken over.
 *
 * <p>Safe to call on any error and any number of times: the dialog dedupes on its own open state.
 */
export function reportAccountLinkBlock(error: unknown): boolean {
  if (classifyAccountLinkBlock(error) !== "FREE_TIER_EXHAUSTED") return false;
  try {
    window.dispatchEvent(new Event(FREE_TIER_EXHAUSTED_EVENT));
  } catch {
    // Non-browser env (tests / SSR) — the throw must not replace the caller's own error.
    return false;
  }
  return true;
}
