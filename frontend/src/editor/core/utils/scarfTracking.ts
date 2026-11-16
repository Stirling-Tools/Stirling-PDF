/**
 * Scarf analytics pixel tracking utility
 *
 * This module provides a firePixel function that can be called from anywhere,
 * including non-React utility functions. Configuration and consent state are
 * injected via setScarfConfig() which should be called from a React hook
 * during app initialization.
 *
 * firePixel() can be called BEFORE setScarfConfig() runs: pre-config calls
 * are queued and replayed once setScarfConfig fires, so the initial-page-load
 * pixel from useUrlSync doesn't race the useScarfTracking init effect.
 *
 * For testing: Use resetScarfConfig() to clear module state between tests.
 */

// Module-level state
let configured: boolean = false;
let enableScarf: boolean | null = null;
let isServiceAccepted: ((service: string, category: string) => boolean) | null =
  null;
let lastFiredPathname: string | null = null;
let lastFiredTime = 0;
// Pathnames passed to firePixel() before setScarfConfig() has run. Drained
// once configured. Bounded to the most recent few entries since intermediate
// path changes during a slow init are uninteresting.
const pendingPaths: string[] = [];
const PENDING_PATHS_CAP = 8;

/**
 * Configure scarf tracking with app config and consent checker
 * Should be called from a React hook during app initialization (see useScarfTracking)
 *
 * @param scarfEnabled - Whether scarf tracking is enabled globally
 * @param consentChecker - Function to check if user has accepted scarf service
 */
export function setScarfConfig(
  scarfEnabled: boolean | null,
  consentChecker: (service: string, category: string) => boolean,
): void {
  configured = true;
  enableScarf = scarfEnabled;
  isServiceAccepted = consentChecker;
  // Drain anything queued before we were configured. Splice first so a
  // re-entrant firePixel from inside the drain can't re-queue.
  const queued = pendingPaths.splice(0);
  for (const path of queued) firePixel(path);
}

/**
 * Fire scarf pixel for analytics tracking
 * Only fires if:
 * - Scarf tracking has been initialized via setScarfConfig()
 * - Scarf is globally enabled in config
 * - User has accepted scarf service via cookie consent
 * - Pathname has changed or enough time has passed since last fire
 *
 * @param pathname - The pathname to track (usually window.location.pathname)
 */
export function firePixel(pathname: string): void {
  // Pre-init: queue and bail. setScarfConfig() drains.
  if (!configured) {
    if (pendingPaths.length >= PENDING_PATHS_CAP) pendingPaths.shift();
    pendingPaths.push(pathname);
    return;
  }

  // Check if Scarf is globally disabled
  if (enableScarf === false) {
    return;
  }

  // Check if consent checker is available and scarf service is accepted
  if (!isServiceAccepted || !isServiceAccepted("scarf", "analytics")) {
    return;
  }

  const now = Date.now();

  // Only fire if pathname changed or it's been at least 250ms since last fire
  if (pathname === lastFiredPathname && now - lastFiredTime < 250) {
    return;
  }

  lastFiredPathname = pathname;
  lastFiredTime = now;

  const url =
    "https://static.scarf.sh/a.png?x-pxid=3c1d68de-8945-4e9f-873f-65320b6fabf7" +
    "&path=" +
    encodeURIComponent(pathname);

  const img = new Image();
  img.referrerPolicy = "no-referrer-when-downgrade";
  img.src = url;
}

/**
 * Reset scarf tracking configuration and state
 * Useful for testing to ensure clean state between test runs
 */
export function resetScarfConfig(): void {
  configured = false;
  enableScarf = null;
  isServiceAccepted = null;
  lastFiredPathname = null;
  lastFiredTime = 0;
  pendingPaths.length = 0;
}
