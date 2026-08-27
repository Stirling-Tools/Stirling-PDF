import { useEffect, useRef } from "react";
import { useConnectGate } from "@portal/hooks/useConnectGate";

const PROMPTED_KEY = "portal::connect-prompted";

function alreadyPrompted(): boolean {
  try {
    return sessionStorage.getItem(PROMPTED_KEY) === "true";
  } catch {
    return false;
  }
}

function markPrompted(): void {
  try {
    sessionStorage.setItem(PROMPTED_KEY, "true");
  } catch {
    // Storage refused. Falling back to prompting again later is the harmless direction.
  }
}

/**
 * Opens the Connect flow once per session while the instance can link but has not.
 *
 * <p>Dismissible, and it comes back. That rules out the onboarding storage helpers
 * ({@code markFlowSeen} and friends), which persist to localStorage and would suppress the ask for
 * good after a single dismissal. A session key instead: closed for this visit, asked again on the
 * next one, indefinitely, until the account is connected. There is no timer to tune and nothing to
 * explain to the admin.
 *
 * <p>The marker is written when the prompt opens rather than when it closes, so a session gets at
 * most one, whatever the admin does with it. Once linked the gate closes and this stops firing.
 */
export function useConnectPrompt(): void {
  const { gated, loading, connect } = useConnectGate();
  const fired = useRef(false);

  useEffect(() => {
    if (loading || !gated || fired.current || alreadyPrompted()) return;
    fired.current = true;
    markPrompted();
    connect();
  }, [gated, loading, connect]);
}
