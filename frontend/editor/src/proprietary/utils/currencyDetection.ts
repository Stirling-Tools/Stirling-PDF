const STORAGE_KEY = "explicitPricingCurrency";

/** A display preference only; Stripe owns checkout currency selection. */
export function getCachedCurrency(): string | null {
  try {
    const currency = localStorage.getItem(STORAGE_KEY);
    return currency && /^[a-z]{3}$/.test(currency) ? currency : null;
  } catch {
    return null;
  }
}

/** Stores an explicit selection, never a browser-language guess. */
export function setCachedCurrency(currency: string): void {
  try {
    if (/^[a-z]{3}$/.test(currency))
      localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // Private browsing may disable storage.
  }
}

/** USD is the estimate until a user chooses a display currency or Stripe returns one. */
export function getPreferredCurrency(): string {
  return getCachedCurrency() ?? "usd";
}
