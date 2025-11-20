/**
 * Protocol detection utility for determining secure context
 * Used to decide between Embedded Checkout (HTTPS) and Hosted Checkout (HTTP)
 */

/**
 * Check if the current context is secure (HTTPS or localhost)
 * @returns true if HTTPS or localhost, false if HTTP
 */
export function isSecureContext(): boolean {
  // Allow localhost for development (works with both HTTP and HTTPS)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // Localhost is considered secure for development
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return true;
    }

    // Check if HTTPS
    return protocol === 'https:';
  }

  // Default to false if window is not available (SSR context)
  return false;
}

/**
 * Get the appropriate Stripe checkout UI mode based on current context
 * @returns 'embedded' for HTTPS/localhost, 'hosted' for HTTP
 */
export function getCheckoutMode(): 'embedded' | 'hosted' {
  return isSecureContext() ? 'embedded' : 'hosted';
}

/**
 * Check if Embedded Checkout can be used in current context
 * @returns true if secure context (HTTPS/localhost)
 */
export function canUseEmbeddedCheckout(): boolean {
  return isSecureContext();
}
