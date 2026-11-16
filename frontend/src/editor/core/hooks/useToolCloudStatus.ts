/**
 * Core stub for tool cloud status checking
 * Desktop layer provides the real implementation
 * In web builds, always returns false (no cloud routing)
 */
export function useToolCloudStatus(_endpointName?: string): boolean {
  return false; // Core stub - web builds don't use cloud
}
