/**
 * Desktop-build feature gates. Shadows `proprietary/constants/featureFlags.ts`
 * (the desktop `@app/*` alias has no saas layer). Re-exports the proprietary
 * flags and re-enables Policies: the desktop Policies gate additionally requires
 * an active SaaS connection (see desktop PoliciesSidebar's `usePoliciesEnabled`),
 * so the flag must be on for that runtime check to ever apply.
 */
export * from "@proprietary/constants/featureFlags";

export const POLICIES_ENABLED: boolean = true;
