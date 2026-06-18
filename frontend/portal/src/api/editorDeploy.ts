import { httpJson } from "@portal/api/http";
import type { EditorDeploymentResponse } from "@portal/mocks/editorDeploy";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  DeploymentTarget,
  DeploymentSummary,
  DeploymentSummaryMetric,
  EditorDeploymentResponse,
  EditorInstance,
  InstanceStatus,
  PairingMethod,
  PairingOption,
  TargetKind,
  TargetMeta,
  TargetState,
} from "@portal/mocks/editorDeploy";
export {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  TARGET_META,
} from "@portal/mocks/editorDeploy";

/**
 * GET /v1/editor/deployment?tier=… — the org's Editor deployment: summary
 * metric strip, deployment targets (with run snippets), pairing options, and
 * the live instance health table for the tier.
 */
export async function fetchEditorDeployment(
  tier: Tier,
): Promise<EditorDeploymentResponse> {
  return httpJson<EditorDeploymentResponse>(
    `/v1/editor/deployment?tier=${encodeURIComponent(tier)}`,
  );
}
