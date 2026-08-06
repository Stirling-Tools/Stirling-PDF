/**
 * Core stub for cloud usage detection
 * Desktop layer provides the real implementation
 * In web builds, always returns false since there's no cloud routing
 */
export function useWillUseCloud(_endpoint?: string): boolean {
  return false; // Core stub - web builds don't use cloud
}
