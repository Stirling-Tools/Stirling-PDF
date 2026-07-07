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
  // An explicit user toggle (persisted) always wins.
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  // Build-time default: VITE_PORTAL_MOCKS forces mocks on/off. The single-origin
  // proxy sets it false so the portal hits the real backend (otherwise the dev
  // mock worker would seed a fake token over the shared real one). Falls back to
  // on-in-dev, off-in-production.
  const envDefault = import.meta.env.VITE_PORTAL_MOCKS;
  if (envDefault === "true") return true;
  if (envDefault === "false") return false;
  return import.meta.env.DEV;
}

export function writeMocksPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
}
