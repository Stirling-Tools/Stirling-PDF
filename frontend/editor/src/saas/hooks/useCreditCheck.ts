import { useCallback } from "react";

/**
 * Pre-flight credit-balance check, formerly run before every billable tool call.
 *
 * Replaced by PAYG's reactive 402 FEATURE_DEGRADED handler (see paygErrorInterceptor.ts):
 * we no longer try to predict whether the user has "enough credits" before the request —
 * we make the request, and if the wallet hits the free-tier ceiling the BE returns 402
 * with a discriminating code that the global axios interceptor turns into a toast +
 * prompt-to-add-card. This is more accurate (no race between FE balance cache and the
 * BE's atomic debit) and avoids the round-trip latency of a pre-flight call.
 *
 * The hook signature is preserved as a no-op so {@code useToolOperation} (the sole
 * caller) compiles without modification. {@code checkCredits} always resolves to null
 * — the BE's 402 handler is now the only gate.
 */
export function useCreditCheck(
  _operationType?: string,
  _endpoint?: string,
): { checkCredits: (_runtimeEndpoint?: string) => Promise<string | null> } {
  const checkCredits = useCallback(
    async (_runtimeEndpoint?: string): Promise<string | null> => null,
    [],
  );
  return { checkCredits };
}
