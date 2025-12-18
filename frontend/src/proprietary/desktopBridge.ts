import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Desktop bridge used by self-hosted SSO deep links.
 * Uses direct Tauri commands so we don't rely on desktop-specific path aliases.
 */
export async function completeSelfHostedDeepLink(serverUrl: string): Promise<void> {
  if (!isTauri()) return;

  const normalizedUrl = serverUrl.replace(/\/$/, '');

  // Persist server config for desktop backend
  try {
    await invoke('set_connection_mode', { mode: 'selfhosted', serverConfig: { url: normalizedUrl } });
  } catch (err) {
    console.warn('[DesktopBridge] Failed to set connection mode', err);
  }

  // Ensure backend is started/pointing at the provided server
  try {
    await invoke('start_backend', { backendUrl: normalizedUrl });
  } catch (err) {
    console.warn('[DesktopBridge] Failed to start backend', err);
  }
}
