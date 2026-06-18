/**
 * SaaS-build feature gates. Shadows `proprietary/constants/featureFlags.ts` in
 * the saas build (via the `@app/*` alias). Re-exports the proprietary flags and
 * overrides only those that differ for the hosted SaaS product.
 */
export * from "@proprietary/constants/featureFlags";

/** Policies are a SaaS-only feature — enabled here, off in proprietary/core. */
export const POLICIES_ENABLED: boolean = true;
