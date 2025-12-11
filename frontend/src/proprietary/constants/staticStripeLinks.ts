/**
 * Static Stripe payment links for offline/self-hosted environments
 *
 * These links are used when Supabase is not configured, allowing users to
 * purchase licenses directly through Stripe hosted checkout pages.
 *
 * NOTE: These are test environment URLs. Replace with production URLs before release.
 */

export interface StaticStripeLinks {
  server: {
    monthly: string;
    yearly: string;
  };
  enterprise: {
    monthly: string;
    yearly: string;
  };
  billingPortal: string;
}
// PRODCUTION LINKS FOR LIVE SERVER
export const STATIC_STRIPE_LINKS: StaticStripeLinks = {
  server: {
    monthly: 'https://buy.stripe.com/fZu4gB8Nv6ysfAj0ts8Zq03',
    yearly: 'https://buy.stripe.com/9B68wR6Fn0a40Fpcca8Zq02',
  },
  enterprise: {
    monthly: '',
    yearly: '',
  },
  billingPortal: 'https://billing.stripe.com/p/login/test_aFa5kv1Mz2s10Fr3Cp83C00',
};

// LINKS FOR TEST SERVER: 
// export const STATIC_STRIPE_LINKS: StaticStripeLinks = {
//   server: {
//     monthly: 'https://buy.stripe.com/test_8x27sD4YL9Ut0Fr3Cp83C02',
//     yearly: 'https://buy.stripe.com/test_4gMdR11Mz4A9ag17SF83C03',
//   },
//   enterprise: {
//     monthly: 'https://buy.stripe.com/test_8x2cMX9f18Qp9bX0qd83C04',
//     yearly: 'https://buy.stripe.com/test_6oU00b2QD2s173P6OB83C05',
//   },
//   billingPortal: 'https://billing.stripe.com/p/login/test_aFa5kv1Mz2s10Fr3Cp83C00',
// };

/**
 * Builds a Stripe URL with a prefilled email parameter
 * @param baseUrl - The base Stripe checkout URL
 * @param email - The email address to prefill
 * @returns The complete URL with encoded email parameter
 */
export function buildStripeUrlWithEmail(baseUrl: string, email: string): string {
  const encodedEmail = encodeURIComponent(email);
  return `${baseUrl}?locked_prefilled_email=${encodedEmail}`;
}
