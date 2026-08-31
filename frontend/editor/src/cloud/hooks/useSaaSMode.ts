/**
 * Cloud web (saas) has no self-hosted/connected toggle — it always talks to
 * its own backend, so this is unconditionally true here. Desktop shadows
 * this (desktop/hooks/useSaaSMode.ts) with the real self-hosted-vs-connected
 * state; core's stub (always false) is for the plain OSS/proprietary web
 * builds, which never reach cloud/ code at all.
 */
export function useSaaSMode(): boolean {
  return true;
}
