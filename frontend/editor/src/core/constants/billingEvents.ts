/**
 * Fired when a hosted Stripe page hands the user back to an app that did not
 * navigate to it: desktop sends those pages to the system browser, and the
 * browser comes back through a deep link. Detail: the return's query string
 * (`session_id`, `payment_status`, ...), the same parameters the web reads from
 * its own address after a redirect.
 */
export const STRIPE_RETURN_EVENT = "stirling:stripe-return";

/** The desktop app's address for a Stripe return. The web app's /desktop/return
 *  page opens it; desktop listens for it. */
export const DESKTOP_BILLING_RETURN = "stirlingpdf://billing/return";
