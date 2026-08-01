import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import { useClientSideClassification } from "@app/components/policies/useClientSideClassification";

/**
 * Headless controller that drives policy auto-run (enforce every enabled policy
 * on every uploaded file). Mounted once wherever the editor is open so runs fire
 * regardless of whether the policy panel is visible. Renders nothing.
 */
export function PolicyAutoRunController() {
  usePolicyAutoRun();
  // Non-AI systems classify uploads in the browser; inert when the AI engine is on.
  useClientSideClassification();
  return null;
}
