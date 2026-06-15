/**
 * Billing data seam (@app/services/billing).
 *
 * Creating Stripe Checkout / Customer Portal sessions touches platform-specific
 * transport (saas: supabase-js web client; desktop: Tauri native HTTP with an
 * explicit bearer + deep-link return URL). Cloud code can't reach those
 * directly, so it mints sessions through this seam. This module is the DEFAULT +
 * shared contract; saas/services/billing.ts and desktop/services/billing.ts
 * shadow it. The default bodies throw so an accidental real-build resolution is
 * loud (only the cloud-standalone typecheck reaches them).
 */

/** Plan identifier for subscription checkouts. */
export type PlanID = "pro" | null;

/**
 * Parameters for {@link createCheckoutSession}, covering both billing flows:
 *  - the legacy {@code create-checkout} subscription flow (see StripeCheckoutSaas), and
 *  - the PAYG {@code create-checkout-session} flow (see StripeCheckoutPanel),
 *    keyed off {@link teamId} — the edge function runs outside Spring Security
 *    and can't resolve the team from the JWT alone.
 *
 * The platform impl supplies the return URL itself (browser origin on web,
 * deep-link scheme on desktop), so it is intentionally NOT part of this shape.
 */
export interface CheckoutParams {
  /** Plan to subscribe to. */
  plan?: PlanID;
  /** Whether this checkout converts an existing trial into a paid subscription. */
  isTrialConversion?: boolean;
  /** The caller's team id. When present, drives the PAYG create-checkout-session flow. */
  teamId?: number;
  /** Lower-case 3-letter ISO currency (e.g. {@code "gbp"}). Selects the Stripe Price for the PAYG flow. */
  currency?: string;
  /** Billing email for the PAYG Checkout Session; maps to Stripe {@code customer_email} when the team has no customer yet. */
  billingOwnerEmail?: string | null;
  /** Stripe UI mode: {@code "embedded"} returns a clientSecret; {@code "hosted"} returns a url. Defaults to embedded. */
  uiMode?: "embedded" | "hosted";
}

/**
 * Result of {@link createCheckoutSession}. Embedded checkout yields a
 * {@code clientSecret}; hosted checkout yields a {@code url}. Exactly one is set.
 */
export interface CheckoutSession {
  /** Stripe Checkout Session client secret for embedded mode. */
  clientSecret?: string;
  /** Hosted Stripe Checkout URL for redirect mode. */
  url?: string;
  /** Non-prod sentinel: a stubbed secret (prefixed {@code cs_mock_}) renders a placeholder instead of a real iframe. */
  mock?: boolean;
}

/** Result of {@link createPortalSession}. */
export interface PortalSession {
  /** Stripe Customer Portal URL to send the user to. */
  url: string;
}

/**
 * Optional parameters for {@link createPortalSession}. The PAYG portal edge
 * function needs the caller's {@code teamId} (runs outside Spring Security);
 * omitting it falls back to the legacy {@code manage-billing} portal.
 */
export interface PortalParams {
  /** The caller's team id; required by the PAYG portal edge function. */
  teamId?: number | null;
}

/** Create a Stripe Checkout Session via the SaaS billing backend (platform impl required). */
export async function createCheckoutSession(
  _params: CheckoutParams,
): Promise<CheckoutSession> {
  throw new Error("billing: platform impl required");
}

/** Mint a Stripe Customer Portal session via the SaaS billing backend (platform impl required). */
export async function createPortalSession(
  _params?: PortalParams,
): Promise<PortalSession> {
  throw new Error("billing: platform impl required");
}

/**
 * The Stripe publishable key used to initialise {@code loadStripe()} for
 * embedded checkout. Sourced through the seam because cloud code may not read
 * {@code import.meta.env} directly. The cloud default returns "" so the checkout
 * component falls back to its mock placeholder rather than throwing.
 */
export function getStripePublishableKey(): string {
  return "";
}
