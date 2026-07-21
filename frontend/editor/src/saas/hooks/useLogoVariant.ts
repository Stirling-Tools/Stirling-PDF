import type { LogoVariant } from "@app/services/preferencesService";

/**
 * SaaS ships only the modern logo — the classic variant is never shown.
 *
 * This shadows the core hook (which resolves the variant from the stored user
 * preference / server `logoStyle`) so that every logo asset in the SaaS bundle
 * resolves to the `modern-logo` folder. All logo rendering funnels through this
 * hook via `useLogoAssets` / `useLogoPath` (favicon, web manifest, apple-touch
 * icon, wordmark, logo icon, tooltip logo) and the login-carousel slides, so
 * forcing the variant here is sufficient to keep the classic logo out of SaaS.
 *
 * The core variant system is intentionally left intact for the OSS and
 * proprietary builds.
 */
export function useLogoVariant(): LogoVariant {
  return "modern";
}
