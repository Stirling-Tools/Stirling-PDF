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

/**
 * Parameters for {@link createCheckoutSession}, which drives the PAYG
 * {@code create-checkout-session} edge function (see StripeCheckoutPanel). The
 * function runs outside Spring Security, so it needs the caller's {@link teamId}
 * (it can't resolve the team from the JWT alone). The platform impl supplies the
 * return URL itself (browser origin on web, deep-link scheme on desktop), so it
 * is intentionally NOT part of this shape.
 */
export interface CheckoutParams {
  /** The caller's team id. Required — scopes the PAYG subscription. */
  teamId: number;
  /** Lower-case 3-letter ISO currency (e.g. {@code "gbp"}). Selects the Stripe Price. */
  currency?: string;
  /** Billing email for the Checkout Session; maps to Stripe {@code customer_email} when the team has no customer yet. */
  billingOwnerEmail?: string | null;
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
 * Parameters for {@link createPortalSession}. The PAYG portal edge function
 * needs the caller's {@code teamId} (runs outside Spring Security).
 */
export interface PortalParams {
  /** The caller's team id; required by the PAYG portal edge function. */
  teamId: number;
}

/** Create a Stripe Checkout Session via the SaaS billing backend (platform impl required). */
export async function createCheckoutSession(
  _params: CheckoutParams,
): Promise<CheckoutSession> {
  throw new Error("billing: platform impl required");
}

/** Mint a Stripe Customer Portal session via the SaaS billing backend (platform impl required). */
export async function createPortalSession(
  _params: PortalParams,
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
