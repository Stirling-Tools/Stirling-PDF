/**
 * Billing data seam (@app/services/billing).
 *
 * The cloud/ layer is the SHARED hosted/SaaS experience consumed by BOTH the
 * saas (web) and desktop (Tauri) leaves. Creating Stripe Checkout / Customer
 * Portal sessions touches platform-specific transport + config: saas calls the
 * Supabase edge functions through the web supabase-js client (which attaches
 * the web session JWT automatically) with the browser origin as the return
 * URL; desktop calls the same edge functions through Tauri's native HTTP
 * client with an explicit bearer from authService and a deep-link return URL
 * so Stripe can bring the user back into the webview.
 *
 * Cloud code must not reach Supabase / Tauri / window.location directly, so it
 * mints these sessions through this seam. This module is the DEFAULT + the
 * shared TypeScript contract; real builds shadow it with saas/services/
 * billing.ts and desktop/services/billing.ts. This default body is only
 * reached by the cloud-standalone typecheck, so it throws to make an
 * accidental real-build resolution loud.
 */

/** What the user is buying. Mirrors the {@code purchase_type} the create-checkout edge function expects. */
export type PurchaseType = "subscription" | "credits";

/** Plan identifier for subscription checkouts. {@code null} when buying credits. */
export type PlanID = "pro" | null;

/** Credits-pack size for one-off credit purchases. {@code null} for subscription checkouts. */
export type CreditsPack = "xsmall" | "small" | "medium" | "large" | null;

/**
 * Parameters for {@link createCheckoutSession}. Mirrors the body the existing
 * saas {@code create-checkout} edge-function call sends (see StripeCheckoutSaas).
 * The platform impl supplies the {@code callback_base_url}/return URL itself
 * (browser origin on web, deep-link scheme on desktop), so it is intentionally
 * NOT part of this shape.
 */
export interface CheckoutParams {
  /** Subscription vs one-off credits purchase. */
  purchaseType: PurchaseType;
  /** Plan to subscribe to; null for a credits purchase. */
  plan?: PlanID;
  /** Credits pack to buy; null for a subscription. */
  creditsPack?: CreditsPack;
  /**
   * Whether this checkout converts an existing trial into a paid subscription.
   * Passed through to the edge function as {@code trial_conversion}.
   */
  isTrialConversion?: boolean;
  /**
   * Stripe UI mode. {@code "embedded"} returns a {@code clientSecret} for the
   * in-app EmbeddedCheckout iframe; {@code "hosted"} returns a {@code url} to
   * redirect to. Defaults to {@code "embedded"} when omitted.
   */
  uiMode?: "embedded" | "hosted";
}

/**
 * Result of {@link createCheckoutSession}. Embedded checkout yields a
 * {@code clientSecret} (mount it in {@code <EmbeddedCheckoutProvider>}); hosted
 * checkout yields a {@code url} to send the user to. Exactly one is populated
 * depending on {@link CheckoutParams#uiMode}.
 */
export interface CheckoutSession {
  /** Stripe Checkout Session client secret for embedded mode. */
  clientSecret?: string;
  /** Hosted Stripe Checkout URL for redirect mode. */
  url?: string;
}

/** Result of {@link createPortalSession}. */
export interface PortalSession {
  /** Stripe Customer Portal URL to send the user to. */
  url: string;
}

/**
 * Optional parameters for {@link createPortalSession}. The PAYG portal edge
 * function ({@code create-customer-portal-session}) needs the caller's
 * {@code teamId} because it runs outside Spring Security and can't resolve the
 * team from the JWT alone. Omitting it falls back to the legacy
 * {@code manage-billing} portal, which derives the team from the JWT.
 */
export interface PortalParams {
  /** The caller's team id; required by the PAYG portal edge function. */
  teamId?: number | null;
}

/**
 * Create a Stripe Checkout Session via the SaaS billing backend. Each platform
 * supplies its own implementation (web supabase client vs Tauri fetch with an
 * explicit bearer); this default is never reached in a real build.
 */
export async function createCheckoutSession(
  _params: CheckoutParams,
): Promise<CheckoutSession> {
  throw new Error("billing: platform impl required");
}

/**
 * Mint a Stripe Customer Portal session via the SaaS billing backend. Each
 * platform supplies its own implementation; this default is never reached in a
 * real build.
 */
export async function createPortalSession(
  _params?: PortalParams,
): Promise<PortalSession> {
  throw new Error("billing: platform impl required");
}
