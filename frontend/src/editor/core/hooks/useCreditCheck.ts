/**
 * No-op stub kept only to satisfy useToolOperation's @app/hooks/useCreditCheck
 * import. There is no pre-flight credit/usage check anymore — PAYG is enforced
 * server-side (the BE returns 402 FEATURE_DEGRADED / PAYG_LIMIT_REACHED, which
 * paygErrorInterceptor turns into the usage-limit modal). Always allows.
 */
export function useCreditCheck(_operationType?: string, _endpoint?: string) {
  return {
    checkCredits: async (_runtimeEndpoint?: string): Promise<string | null> =>
      null, // null = allowed
  };
}
