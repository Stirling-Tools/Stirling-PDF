/**
 * Protocol detection utility for determining secure context
 * Used to decide between Embedded Checkout (HTTPS) and Hosted Checkout (HTTP)
 */

/**
 * Check if Stripe publishable key is configured
 * Similar to isSupabaseConfigured pattern - checks availability at decision points
 * @returns true if key exists and has valid format
 */
export function isStripeConfigured(): boolean {
  const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_live_51Q56W2P9mY5IAnSnp3kcxG50uyFMLuhM4fFs774DAP3t88KmlwUrUo31CecpnAZ9FHsNp8xJyOnYNYNVVP6z4oi500q5sFYPEp';
  return !!stripeKey && stripeKey.startsWith('pk_');
}

/**
 * Check if the current context is secure (HTTPS or localhost)
 * @returns true if HTTPS or localhost, false if HTTP
 */
export function isSecureContext(): boolean {
  // Allow localhost for development (works with both HTTP and HTTPS)
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;

    // Localhost is considered secure for development
    // const hostname = window.location.hostname;
    // if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    //   return true;
    // }

    // Check if HTTPS
    return protocol === 'https:';
  }

  // Default to false if window is not available (SSR context)
  return false;
}

/**
 * Get the appropriate Stripe checkout UI mode based on current context
 * @returns 'embedded' for HTTPS with key, 'hosted' for HTTP or missing key
 */
export function getCheckoutMode(): 'embedded' | 'hosted' {
  // Force hosted checkout if no publishable key (regardless of protocol)
  // Hosted checkout works without the key - it just redirects to Stripe
  if (!isStripeConfigured()) {
    return 'hosted';
  }

  // Normal protocol-based detection if key is available
  return isSecureContext() ? 'embedded' : 'hosted';
}

/**
 * Check if Embedded Checkout can be used in current context
 * Requires both HTTPS and Stripe publishable key
 * @returns true if secure context AND key is configured
 */
export function canUseEmbeddedCheckout(): boolean {
  return isSecureContext() && isStripeConfigured();
}
