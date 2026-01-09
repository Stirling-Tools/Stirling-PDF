/**
 * Desktop-specific OAuth callback handling for self-hosted SSO flows.
 */
export async function handleAuthCallbackSuccess(token: string): Promise<void> {
  // Notify desktop popup listeners (self-hosted SSO flow)
  const isDesktopPopup = typeof window !== 'undefined' && window.opener && window.name === 'stirling-desktop-sso';
  if (isDesktopPopup) {
    try {
      window.opener.postMessage({ type: 'stirling-desktop-sso', token }, '*');
    } catch (postError) {
      console.error('[AuthCallback] Failed to notify desktop window:', postError);
    }

    // Give the message a moment to flush before attempting to close
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore close errors
      }
    }, 150);
  }

  // No-op beyond popup notification; deep link flow handles desktop completion.
}
