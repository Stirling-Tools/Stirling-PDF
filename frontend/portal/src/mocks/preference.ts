/// <reference types="vite/client" />

/**
 * Lightweight preference helpers — pulled out of mocks/browser.ts so they
 * don't drag MSW + every handler + every fixture into any chunk that just
 * needs to *read* the user's choice. Loading the actual worker stays a
 * dynamic import.
 */

const STORAGE_KEY = "stirling.portal.mocks-enabled";

export function readMocksPreference(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return import.meta.env.DEV;
}

export function writeMocksPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
}
