import { STIRLING_SAAS_URL } from '@app/constants/connection';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';
import type { PlatformSessionUser } from '@proprietary/extensions/platformSessionBridge';

export async function isDesktopSaaSAuthMode(): Promise<boolean> {
  try {
    const mode = await connectionModeService.getCurrentMode();
    return mode === 'saas';
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
    return await authService.refreshSupabaseToken(STIRLING_SAAS_URL);
  } catch {
    return false;
  }
}
