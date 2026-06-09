/**
 * Classifies and reacts to PAYG-specific error responses surfaced by the
 * backend's {@code EntitlementGuard} (Wave 1 BE on PR #6574). Two sentinels
 * are recognised:
 *
 * <ul>
 *   <li>{@code 402 FEATURE_DEGRADED} — free-tier user has burned through
 *       their 500-op monthly allowance. Surface a toast that nudges them to
 *       the Plan tab so they can upgrade.</li>
 *   <li>{@code 401 SIGNUP_REQUIRED} — anonymous (guest) user hit a billable
 *       endpoint. Open a modal explaining why they need a real account and
 *       where their 500-op free monthly allowance comes in. The body's
 *       {@code category} field ({@code AI}, {@code AUTOMATION}, {@code API})
 *       feeds the modal title so the user understands *which* feature they
 *       just hit. We dispatch a {@code CustomEvent} rather than rendering
 *       directly from this module because the apiClient is created outside
 *       the React tree and can't import JSX; the listener lives on a
 *       bootstrap component mounted near the app root.</li>
 * </ul>
 *
 * The classifier is exported separately from the handler so unit tests can
 * exercise the parsing logic without touching the toast / event side
 * effects.
 */
import { alert } from "@app/components/toast";
import i18n from "@app/i18n";
import { openPlanSettings } from "@app/utils/appSettings";

/**
 * Possible PAYG entitlement sentinels the EntitlementGuard returns.
 * {@code null} when the error is not a PAYG entitlement response.
 */
export type PaygErrorKind = "FEATURE_DEGRADED" | "SIGNUP_REQUIRED";

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
 * Surface the appropriate UI for a classified PAYG error. Toast for
 * {@code FEATURE_DEGRADED}, modal-via-CustomEvent for {@code SIGNUP_REQUIRED}.
 *
 * Idempotent / safe to call multiple times — the toast layer coalesces
 * duplicates by (alertType, title, body) and the modal listener already
 * dedupes by its own opened-state. Suppress-respecting: if the caller
 * passed {@code suppressErrorToast: true} on the axios config (the
 * established pattern for component-level error handling), we still fire
 * the PAYG UI because these are user-facing gates, not transient
 * error toasts — the suppression flag was for the *generic* error toast,
 * which we're replacing with something more actionable.
 */
export function handlePaygError(kind: PaygErrorKind, error: unknown): void {
  if (kind === "FEATURE_DEGRADED") {
    alert({
      alertType: "warning",
      title: i18n.t(
        "payg.exhausted.title",
        "You've hit your free monthly limit",
      ),
      body: i18n.t(
        "payg.exhausted.body",
        "You've used your free 500 operations this month. Upgrade to Processor to keep going.",
      ),
      buttonText: i18n.t("payg.exhausted.cta", "Go to billing"),
      buttonCallback: () => openPlanSettings(),
      isPersistentPopup: true,
      location: "bottom-right",
    });
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
