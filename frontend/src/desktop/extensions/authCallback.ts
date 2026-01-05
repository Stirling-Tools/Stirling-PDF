import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';

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

  // Desktop fallback flow (when popup was blocked and we navigated directly)
  const pending = localStorage.getItem('desktop_self_hosted_sso_pending');
  if (!pending) {
    return;
  }

  try {
    const parsed = JSON.parse(pending) as { serverUrl?: string } | null;
    if (parsed?.serverUrl) {
      await connectionModeService.switchToSelfHosted({ url: parsed.serverUrl });
      await tauriBackendService.initializeExternalBackend();
    }
  } catch (desktopError) {
    console.error('[AuthCallback] Desktop fallback completion failed:', desktopError);
  } finally {
    localStorage.removeItem('desktop_self_hosted_sso_pending');
  }
}
