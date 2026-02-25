/**
 * Comprehensive conversion status data
 */
export interface ConversionStatus {
  availability: Record<string, boolean>;   // Available on local OR SaaS?
  cloudStatus: Record<string, boolean>;    // Will use cloud?
  localOnly: Record<string, boolean>;      // Available ONLY locally (not on SaaS)?
}

/**
 * Core stub for conversion cloud status checking
 * Desktop layer provides the real implementation
 * In web builds, always returns empty objects (no cloud routing)
 */
export function useConversionCloudStatus(): ConversionStatus {
  return {
    availability: {},
    cloudStatus: {},
    localOnly: {},
  }; // Core stub - web builds don't use cloud
}
