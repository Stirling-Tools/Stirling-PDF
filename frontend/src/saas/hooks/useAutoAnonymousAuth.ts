/**
 * Auto anonymous auth is not supported in Spring Security mode.
 * This hook is a no-op stub for compatibility.
 */
export function useAutoAnonymousAuth() {
  return {
    isAutoAuthenticating: false,
    autoAuthError: null,
    shouldTriggerAutoAuth: false,
    triggerAnonymousAuth: async () => {},
  }
}
