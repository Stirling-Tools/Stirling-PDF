import { useTourActive } from "@app/hooks/useTourActive";
import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import { usePolicyLocalPasses } from "@app/components/policies/usePolicyLocalPasses";

/**
 * Headless controller that drives policy auto-run (enforce every enabled policy
 * on every uploaded file). Mounted once wherever the editor is open so runs fire
 * regardless of whether the policy panel is visible. Renders nothing.
 *
 * <p>Paused while a guided tour is running: the tour loads a throwaway sample file
 * purely to demonstrate a tool, and running it through the policy pipelines would
 * meter a billable classification and dispatch an entitlement-gated server run
 * that, on the pay-as-you-go plan, can surface the usage-limit modal in the
 * middle of onboarding (even on a brand-new account). A demo must have no billing
 * side effects. See {@link useTourActive}.
 */
export function PolicyAutoRunController() {
  const tourActive = useTourActive();
  // Server-dispatched, file-producing policies and their chain.
  usePolicyAutoRun({ paused: tourActive });
  // Policies with a browser-side fast path (e.g. classification's heuristic), run generically.
  usePolicyLocalPasses({ paused: tourActive });
  return null;
}
