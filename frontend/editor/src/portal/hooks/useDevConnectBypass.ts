import { useEffect, useState } from "react";

const PARAM = "bypassConnect";
const SESSION_KEY = "accountLink::dev-bypass";

function stored(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Dev-only escape from the connect gate, fenced behind {@code import.meta.env.DEV} so Vite folds
 * the branch away entirely: in a shipped build there is no param and no key that does anything.
 * It cannot be a setting — the gate is the only thing making these features need a link, so any
 * switch a customer could reach would hand them over.
 */
export function useDevConnectBypass(): boolean {
  // Session-scoped so it survives the navigation the gate itself performs.
  const [bypassed, setBypassed] = useState(
    () => import.meta.env.DEV && stored(),
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(PARAM) !== "true") return;
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // Still bypassed for this render.
    }
    setBypassed(true);
  }, []);

  return bypassed;
}
