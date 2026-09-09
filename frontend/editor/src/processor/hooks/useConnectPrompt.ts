import { useEffect, useRef } from "react";
import { useConnectGate } from "@processor/hooks/useConnectGate";

const PROMPTED_KEY = "processor::connect-prompted";

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
    // Prompting again later is the harmless direction.
  }
}

/**
 * Session storage, not the onboarding localStorage helpers: one dismissal should not end the ask
 * for good, and asking once per visit needs no timer to tune.
 */
export function useConnectPrompt(): void {
  const { gated, loading, connect } = useConnectGate();
  const fired = useRef(false);

  useEffect(() => {
    if (loading || !gated || fired.current || alreadyPrompted()) return;
    fired.current = true;
    // Marked on open, not on close, so a session gets one whatever the admin does with it.
    markPrompted();
    connect();
  }, [gated, loading, connect]);
}
