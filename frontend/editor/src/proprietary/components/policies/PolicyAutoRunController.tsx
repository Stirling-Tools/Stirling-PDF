import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import { usePolicyLocalPasses } from "@app/components/policies/usePolicyLocalPasses";

/**
 * Headless controller that drives policy auto-run (enforce every enabled policy
 * on every uploaded file). Mounted once wherever the editor is open so runs fire
 * regardless of whether the policy panel is visible. Renders nothing.
 */
export function PolicyAutoRunController() {
  // Server-dispatched, file-producing policies and their chain.
  usePolicyAutoRun();
  // Policies with a browser-side fast path (e.g. classification's heuristic), run generically.
  usePolicyLocalPasses();
  return null;
}
