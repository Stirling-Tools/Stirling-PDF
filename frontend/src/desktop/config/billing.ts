/**
 * Billing Configuration for Desktop
 * Single source of truth for billing-related constants
 */

export const BILLING_CONFIG = {
  // Credits included in Free plan (per month)
  FREE_CREDITS_PER_MONTH: 50,

  // Credits included in Pro plan (per month)
  INCLUDED_CREDITS_PER_MONTH: 500,

  // Overage pricing (per credit) - also fetched dynamically from Stripe
  OVERAGE_PRICE_PER_CREDIT: 0.05,

  // Credit warning threshold
  LOW_CREDIT_THRESHOLD: 10,

  // Stripe lookup keys
  PRO_PLAN_LOOKUP_KEY: 'plan:pro',
  METER_LOOKUP_KEY: 'meter:overage',

  // Display formats
  CURRENCY_SYMBOLS: {
    gbp: '£',
    usd: '$',
    eur: '€',
    cny: '¥',
    inr: '₹',
    brl: 'R$',
    idr: 'Rp',
    jpy: '¥'
  } as const
} as const;

/**
 * Get current billing configuration
 */
export function getBillingConfig() {
  return BILLING_CONFIG;
}

/**
 * Format overage price with currency symbol
 * @param currency Currency code (e.g., 'usd', 'gbp')
 * @param price Optional price override (defaults to BILLING_CONFIG.OVERAGE_PRICE_PER_CREDIT)
 */
export function getFormattedOveragePrice(currency: string = 'usd', price?: number): string {
  const symbol = BILLING_CONFIG.CURRENCY_SYMBOLS[currency.toLowerCase() as keyof typeof BILLING_CONFIG.CURRENCY_SYMBOLS] || '$';
  const amount = price ?? BILLING_CONFIG.OVERAGE_PRICE_PER_CREDIT;
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Get currency symbol from currency code
 */
export function getCurrencySymbol(currency: string): string {
  return BILLING_CONFIG.CURRENCY_SYMBOLS[currency.toLowerCase() as keyof typeof BILLING_CONFIG.CURRENCY_SYMBOLS] || currency.toUpperCase();
}
