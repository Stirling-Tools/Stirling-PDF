import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';

/**
 * Desktop-specific OAuth navigation: prefer popup/system browser, avoid hijacking main webview.
 */
export async function startOAuthNavigation(redirectUrl: string): Promise<boolean> {
  try {
    const currentConfig = await connectionModeService.getCurrentConfig().catch(() => null);
    const serverUrl = currentConfig?.server_config?.url;
    if (!serverUrl) {
      return false;
    }

    const providerUrl = new URL(redirectUrl, serverUrl);
    const providerPath = `${providerUrl.pathname}${providerUrl.search}`;
    await authService.loginWithSelfHostedOAuth(providerPath, serverUrl);
    return true;
  } catch (error) {
    console.warn('[Desktop OAuthNavigation] Failed to start OAuth flow', error);
    return false;
  }
}
