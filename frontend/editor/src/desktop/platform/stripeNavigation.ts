import { openExternal } from "@app/platform/openExternal";
import { STIRLING_SAAS_FRONTEND_URL } from "@app/constants/connection";
import { noteBillingHandoff } from "@app/services/billingReturn";

/**
 * Desktop: every Stripe page opens in the system browser. Stripe only returns to
 * http(s) pages, so it returns to the web app's /desktop/return page, which
 * reopens this app with the result; the app's own origin is not reachable from
 * a browser. Embedded checkout is off because the webview's navigation guard
 * stops Stripe's frames on macOS and Linux.
 */
function webApp(): string {
  return (STIRLING_SAAS_FRONTEND_URL ?? "").replace(/\/+$/, "");
}

export function stripeReturnUrl(): string {
  return `${webApp()}/desktop/return`;
}

export function openStripePage(
  url: string,
  _target: "self" | "tab" = "self",
): boolean {
  noteBillingHandoff();
  void openExternal(url);
  return true;
}

export function stripeCheckoutEmbeds(): boolean {
  return false;
}

/** For a Stirling Cloud that only offers embedded checkout: finish on the web. */
export function stripeCheckoutFallbackUrl(): string | null {
  return `${webApp()}/settings/billing`;
}
