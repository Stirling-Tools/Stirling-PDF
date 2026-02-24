import { invoke } from '@tauri-apps/api/core';

const TOKEN_KEY = 'stirling_jwt';

/**
 * Read auth token from any available source (Tauri store or localStorage).
 * Kept separate to avoid circular dependencies between auth and backend services.
 */
export async function getAuthTokenFromAnySource(): Promise<string | null> {
  // Try Tauri store first
  try {
    const token = await invoke<string | null>('get_auth_token');
    if (token) {
      return token;
    }
  } catch (error) {
    console.error('[Desktop AuthTokenStore] Failed to read from Tauri store:', error);
  }

  // Fallback to localStorage
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('[Desktop AuthTokenStore] Failed to read from localStorage:', error);
    return null;
  }
}
