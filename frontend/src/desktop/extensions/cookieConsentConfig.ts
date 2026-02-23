/**
 * Desktop override: allow cookie consent persistence on non-HTTPS origins.
 * Tauri runs on tauri:// or http://localhost in dev, so Secure cookies
 * won't persist unless we disable Secure for those schemes.
 */
export function getCookieConsentOverrides(): Record<string, unknown> {
  return {
    cookie: {
      secure: window.location.protocol === 'https:'
    }
  };
}
