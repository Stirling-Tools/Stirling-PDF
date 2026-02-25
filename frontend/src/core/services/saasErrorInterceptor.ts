/**
 * Core stub for SaaS backend error interception.
 * Desktop layer shadows this with the real implementation.
 * In web builds there are no SaaS requests, so this always returns false.
 */
export function handleSaaSError(_error: unknown): boolean {
  return false;
}
