/**
 * Classifies and reacts to PAYG-specific error responses surfaced by the
 * backend's {@code EntitlementGuard}. Three sentinels are recognised:
 *
 * <ul>
 *   <li>{@code 402 FEATURE_DEGRADED} — an authenticated (JWT/web) team hit a
 *       billable feature it no longer has: a free team that spent its one-time
 *       allowance, or a subscribed team over its monthly spending cap. Which
 *       one is told by the {@code subscribed} field on the body.</li>
 *   <li>{@code 402 PAYG_LIMIT_REACHED} — same situation reached via an API key
 *       (programmatic client). Also carries {@code subscribed}.</li>
 *   <li>{@code 401 SIGNUP_REQUIRED} — anonymous (guest) user hit a billable
 *       endpoint. Opens the signup modal (a different flow) via a
 *       {@code CustomEvent}.</li>
 * </ul>
 *
 * For the two limit sentinels we pop the matching usage-limit modal (free →
 * "free limit reached", subscribed → "spend cap reached") and show NO toast —
 * the modal is the actionable surface. The modals read the live wallet for the
 * usage figures, so we only need to decide which one to open.
 *
 * The classifier is exported separately from the handler so unit tests can
 * exercise the parsing logic without touching the modal side effects.
 */
import {
  openFreeLimitModal,
  openSpendCapModal,
} from "@app/components/usageLimitModals";

/**
 * Possible PAYG entitlement sentinels the EntitlementGuard returns.
 * {@code null} when the error is not a PAYG entitlement response.
 */
export type PaygErrorKind =
  | "FEATURE_DEGRADED"
  | "PAYG_LIMIT_REACHED"
  | "SIGNUP_REQUIRED";

/**
 * Detail payload broadcast on {@code payg:signupRequired} when an anonymous
 * user hits a billable endpoint. The listener (a Bootstrap component near
 * the app root) opens a modal whose copy is parameterised by
 * {@link #category}.
 */
export interface PaygSignupRequiredDetail {
  /** Category that triggered the gate — {@code AI}, {@code AUTOMATION}, or {@code API}. */
  category: string | null;
}

/**
 * Inspect an axios-style error and decide whether it's one of the known
 * PAYG sentinels. Returns the kind, or {@code null} if it isn't.
 *
 * The check is intentionally strict (status code AND body.error sentinel)
 * so we don't hijack incidental 401/402 responses from other endpoints —
 * notably the existing session-expired 401 flow.
 */
export function classifyPaygError(error: unknown): PaygErrorKind | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;
  const status = (response as { status?: unknown }).status;
  const data = (response as { data?: unknown }).data;
  if (typeof status !== "number") return null;
  if (!data || typeof data !== "object") return null;
  const sentinel = (data as { error?: unknown }).error;
  if (typeof sentinel !== "string") return null;

  if (status === 402 && sentinel === "FEATURE_DEGRADED") {
    return "FEATURE_DEGRADED";
  }
  if (status === 402 && sentinel === "PAYG_LIMIT_REACHED") {
    return "PAYG_LIMIT_REACHED";
  }
  if (status === 401 && sentinel === "SIGNUP_REQUIRED") {
    return "SIGNUP_REQUIRED";
  }
  return null;
}

/** Extract {@code data.category} (a string) from an axios error, or {@code null}. */
export function extractSignupCategory(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const category = (data as { category?: unknown }).category;
  return typeof category === "string" ? category : null;
}

/**
 * Extract {@code data.subscribed} (a boolean) from an axios error. Returns
 * {@code null} when absent so the caller can apply a default. A subscribed
 * team that hits a limit is over its spending cap; an un-subscribed one has
 * spent its free allowance.
 */
export function extractSubscribed(error: unknown): boolean | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const subscribed = (data as { subscribed?: unknown }).subscribed;
  return typeof subscribed === "boolean" ? subscribed : null;
}

/**
 * Surface the appropriate UI for a classified PAYG error.
 *
 * <ul>
 *   <li>{@code FEATURE_DEGRADED} / {@code PAYG_LIMIT_REACHED} — pop the
 *       usage-limit modal (spend-cap when subscribed, free-limit otherwise) and
 *       show no toast. Defaults to the free-limit modal if {@code subscribed}
 *       is absent (most accounts at launch are free tier).</li>
 *   <li>{@code SIGNUP_REQUIRED} — dispatch {@code payg:signupRequired} so the
 *       signup-bootstrap listener opens its modal.</li>
 * </ul>
 *
 * Safe to call multiple times — the modal hosts dedupe by their own open state.
 * Suppress-respecting in spirit: these are user-facing gates, not transient
 * error toasts, so we surface the modal even when the caller passed
 * {@code suppressErrorToast} (that flag was for the generic error toast we are
 * replacing with something more actionable).
 */
export function handlePaygError(kind: PaygErrorKind, error: unknown): void {
  if (kind === "FEATURE_DEGRADED" || kind === "PAYG_LIMIT_REACHED") {
    if (extractSubscribed(error) === true) {
      openSpendCapModal();
    } else {
      openFreeLimitModal();
    }
    return;
  }

  if (kind === "SIGNUP_REQUIRED") {
    const category = extractSignupCategory(error);
    try {
      window.dispatchEvent(
        new CustomEvent<PaygSignupRequiredDetail>("payg:signupRequired", {
          detail: { category },
        }),
      );
    } catch {
      // SSR / test environments without a real window — no-op.
    }
    return;
  }
}
