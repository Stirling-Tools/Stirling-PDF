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
 * Lets a developer work on a flag-on instance without being gated or prompted.
 *
 * <p>Deliberately not a setting. The connect gate is currently the only thing enforcing that teams,
 * the processor, pipelines and policies need a linked account, so any switch a customer could reach
 * would be a way to have them for free. A Spring property or a plain query parameter would both be
 * exactly that.
 *
 * <p>So this is fenced behind {@code import.meta.env.DEV}, which Vite folds to `false` in every
 * build. The branch is not disabled in the shipped artifact, it is absent from it: there is no
 * property, no parameter and no storage key that does anything. Only `vite dev` (task dev) has it,
 * and a developer running from source could remove the gate outright anyway.
 *
 * <p>Opt-in rather than automatic, via {@code ?bypassConnect=true}, so the default dev experience
 * is still the one customers get. Persisted for the session so it survives the navigation the gate
 * itself performs.
 */
export function useDevConnectBypass(): boolean {
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
      // A browser refusing session storage still gets the bypass for this render.
    }
    setBypassed(true);
  }, []);

  return bypassed;
}
