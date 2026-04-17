/**
 * Core stub for credit checking before cloud operations
 * Desktop layer shadows this with the real implementation
 * In web builds, always allows the operation (no credit system)
 */
export function useCreditCheck(_operationType?: string, _endpoint?: string) {
  return {
    checkCredits: async (_runtimeEndpoint?: string): Promise<string | null> =>
      null, // null = allowed
  };
}
