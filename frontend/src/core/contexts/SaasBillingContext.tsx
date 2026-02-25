/**
 * Core stub for SaasBillingContext.
 * Returns null in web/core builds — desktop layer shadows this with the real implementation.
 * See: frontend/src/desktop/contexts/SaasBillingContext.tsx
 */
export const useSaaSBilling = (): null => null;

export function SaasBillingProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
