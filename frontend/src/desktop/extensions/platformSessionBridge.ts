import { STIRLING_SAAS_URL } from '@app/constants/connection';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';
import type { PlatformSessionUser } from '@proprietary/extensions/platformSessionBridge';

export async function isDesktopSaaSAuthMode(): Promise<boolean> {
  try {
    const mode = await connectionModeService.getCurrentMode();
    // Return true for ANY desktop auth mode (SaaS or self-hosted with desktop authService)
    // This skips redundant backend validation in springAuthClient since desktop authService
    // already manages the token lifecycle
    return mode === 'saas' || mode === 'self-hosted';
  } catch {
    return false;
  }
}

export async function getPlatformSessionUser(): Promise<PlatformSessionUser | null> {
  try {
    const userInfo = await authService.getUserInfo();
    if (!userInfo) {
      return null;
    }
    return {
      username: userInfo.username,
      email: userInfo.email,
    };
  } catch {
    return null;
  }
}

export async function refreshPlatformSession(): Promise<boolean> {
  try {
    const mode = await connectionModeService.getCurrentMode();
    if (mode === 'saas') {
      return await authService.refreshSupabaseToken(STIRLING_SAAS_URL);
    } else if (mode === 'self-hosted') {
      const serverConfig = await connectionModeService.getServerConfig();
      if (!serverConfig) {
        return false;
      }
      return await authService.refreshToken(serverConfig.url);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Save token to platform-specific secure storage (Tauri store + localStorage)
 * Called after token refresh to ensure token is synced across all storage locations
 */
export async function savePlatformToken(token: string): Promise<void> {
  try {
    await authService.saveToken(token);
  } catch (error) {
    console.error('[PlatformBridge] Failed to save token:', error);
    throw error;
  }
}
