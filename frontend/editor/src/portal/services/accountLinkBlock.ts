/**
 * The `402 ACCOUNT_LINK_REQUIRED` sentinel, turned into a prompt.
 *
 * <p>Reactive, not predictive: the free tier needs no account, so the UI cannot know whether an
 * action is affordable, and the balance endpoint is admin-only anyway. It runs the action and lets
 * the answer raise the dialog.
 *
 * <p>Only {@code FREE_TIER_EXHAUSTED} is acted on. The others mean a linked team's cloud wallet is
 * the problem, where offering to link would be nonsense, so they fall through to the caller.
 */

/** Bridge to the always-mounted host in PortalProviders. */
export const FREE_TIER_EXHAUSTED_EVENT = "stirling:portal-free-tier-exhausted";

/** Mirrors the backend {@code GateDecision.Reason} blocking arm. */
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
 * <p>Strict on the status and the sentinel both, so an incidental 402 is not hijacked. Reads
 * {@link HttpError} structurally to stay off the import cycle with the client that throws it.
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
 * Raises the prompt if {@code error} is a spent free grant, returning whether it did so a caller
 * can leave its own error surface alone. Safe on any error, any number of times.
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
