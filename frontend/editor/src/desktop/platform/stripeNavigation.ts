import { openExternal } from "@app/platform/openExternal";
import { STIRLING_SAAS_FRONTEND_URL } from "@app/constants/connection";
import { noteBillingHandoff } from "@app/services/billingReturn";
import { stripePageHref } from "@core/platform/stripeNavigation";

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

/** Stripe's pages, or the web app's own fallback for a purchase that cannot finish here. */
function browserHref(url: string): string | null {
  const stripe = stripePageHref(url);
  if (stripe) return stripe;
  try {
    const parsed = new URL(url);
    return webApp() && parsed.origin === new URL(webApp()).origin
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

export function openStripePage(
  url: string,
  _target: "self" | "tab" = "self",
): boolean {
  const href = browserHref(url);
  if (!href) {
    console.warn("[stripe] refused to open a page that is not Stripe's");
    return true;
  }
  noteBillingHandoff();
  void openExternal(href);
  return true;
}

export function stripeCheckoutEmbeds(): boolean {
  return false;
}

/** For a Stirling Cloud that only offers embedded checkout: finish on the web. */
export function stripeCheckoutFallbackUrl(): string | null {
  return `${webApp()}/settings/billing`;
}
