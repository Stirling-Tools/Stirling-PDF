import { loadPolicies } from "@app/services/policyStorage";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { editorTriggerOf } from "@app/policies/runOn";
import type {
  AccountLinkBlockContext,
  AccountLinkBlockSource,
} from "@app/services/accountLinkBlock";

/** Resolves user-facing pipeline details from the editor cache without delaying a failed request. */
export function policyCreditContext(
  pipelineId: string | null,
  source: AccountLinkBlockSource = "background",
): AccountLinkBlockContext {
  const entry = Object.entries(loadPolicies()).find(
    ([, policy]) => Boolean(pipelineId) && policy.backendId === pipelineId,
  );
  const category =
    entry &&
    loadPolicyCatalog().categories.find((item) => item.id === entry[0]);
  return {
    pipelineId: pipelineId ?? undefined,
    pipelineName: entry?.[1].name || category?.label,
    trigger:
      source === "foreground"
        ? "manual"
        : (entry && editorTriggerOf(entry[1])) || "automatic",
  };
}
