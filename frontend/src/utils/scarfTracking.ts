/**
 * Scarf analytics pixel tracking utility
 *
 * This module provides a firePixel function that can be called from anywhere,
 * including non-React utility functions. Configuration and consent state are
 * injected via setScarfConfig() which should be called from a React hook
 * during app initialization.
 *
 * IMPORTANT: setScarfConfig() must be called before firePixel() will work.
 * The initialization hook (useScarfTracking) is mounted in App.tsx.
 *
 * For testing: Use resetScarfConfig() to clear module state between tests.
 */

// Module-level state
let configured: boolean = false;
let enableScarf: boolean | null = null;
let isServiceAccepted: ((service: string, category: string) => boolean) | null = null;
let lastFiredPathname: string | null = null;
let lastFiredTime = 0;

/**
 * Configure scarf tracking with app config and consent checker
 * Should be called from a React hook during app initialization (see useScarfTracking)
 *
 * @param scarfEnabled - Whether scarf tracking is enabled globally
 * @param consentChecker - Function to check if user has accepted scarf service
 */
export function setScarfConfig(
  scarfEnabled: boolean | null,
  consentChecker: (service: string, category: string) => boolean
): void {
  configured = true;
  enableScarf = scarfEnabled;
  isServiceAccepted = consentChecker;
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
  // Dev-mode warning if called before initialization
  if (!configured) {
    console.warn(
      '[scarfTracking] firePixel() called before setScarfConfig(). ' +
      'Ensure useScarfTracking() hook is mounted in App.tsx.'
    );
    return;
  }

  // Check if Scarf is globally disabled
  if (enableScarf === false) {
    return;
  }

  // Check if consent checker is available and scarf service is accepted
  if (!isServiceAccepted || !isServiceAccepted('scarf', 'analytics')) {
    return;
  }

  const now = Date.now();

  // Only fire if pathname changed or it's been at least 250ms since last fire
  if (pathname === lastFiredPathname && now - lastFiredTime < 250) {
    return;
  }

  lastFiredPathname = pathname;
  lastFiredTime = now;

  const url = 'https://static.scarf.sh/a.png?x-pxid=3c1d68de-8945-4e9f-873f-65320b6fabf7'
             + '&path=' + encodeURIComponent(pathname);

  const img = new Image();
  img.referrerPolicy = "no-referrer-when-downgrade";
  img.src = url;
}

/**
 * Reset scarf tracking configuration and state
 * Useful for testing to ensure clean state between test runs
 */
export function resetScarfConfig(): void {
  enableScarf = null;
  isServiceAccepted = null;
  lastFiredPathname = null;
  lastFiredTime = 0;
}
