/**
 * How the app hands a user to hosted Stripe pages and gets them back. A seam:
 * on the web Stripe returns to the page that left, and checkout runs embedded;
 * desktop opens every Stripe page in the system browser and returns through a
 * web page that reopens the app.
 */

/** Where Stripe sends the user afterwards. Without the query: a flag such as
 *  `?upgrade=team` would start its flow again on return. */
export function stripeReturnUrl(): string {
  return window.location.origin + window.location.pathname;
}

/**
 * Opens a hosted Stripe page. `"tab"` keeps this page open behind it and falls
 * back to leaving it when a popup blocker refuses the tab. Returns whether this
 * page is still showing.
 */
export function openStripePage(
  url: string,
  target: "self" | "tab" = "self",
): boolean {
  if (target === "tab") {
    // Not the noopener feature: with it window.open returns null even when the
    // tab opened, which would read as blocked and navigate this page as well.
    const tab = window.open(url, "_blank");
    if (tab) {
      tab.opener = null;
      return true;
    }
  }
  window.location.assign(url);
  return false;
}

/** Whether Stripe Checkout can mount embedded in this page. */
export function stripeCheckoutEmbeds(): boolean {
  return true;
}

/** Where to finish a purchase that cannot be completed here; null when it can. */
export function stripeCheckoutFallbackUrl(): string | null {
  return null;
}
