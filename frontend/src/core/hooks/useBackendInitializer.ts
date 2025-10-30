/**
 * No-op in web builds – desktop overrides provide actual behaviour.
 */
export function useBackendInitializer(): void {
  // Nothing to initialize for browser runtime.
}
