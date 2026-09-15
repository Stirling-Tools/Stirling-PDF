import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import { usePolicyLocalPasses } from "@app/components/policies/usePolicyLocalPasses";
import { PolicyRecoveryGate } from "@app/components/policies/PolicyRecoveryGate";

/**
 * Runs policies and recovery once per editor, independent of the active tool or sidebar.
 */
export function PolicyAutoRunController() {
  // Server-dispatched, file-producing policies and their chain.
  usePolicyAutoRun();
  // Policies with a browser-side fast path (e.g. classification's heuristic), run generically.
  usePolicyLocalPasses();
  return <PolicyRecoveryGate />;
}
