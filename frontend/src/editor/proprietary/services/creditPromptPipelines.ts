import apiClient from "@app/services/apiClient";
import { loadPolicies, updatePolicy } from "@app/services/policyStorage";
import type { WirePolicy, WireEditorConfig } from "@app/policies/types";

/** The overview fields needed to explain and manage active automation in a credit prompt. */
export interface CreditPromptPipeline {
  id: string;
  name: string;
  enabled: boolean;
  required: boolean;
  trigger: string;
  sources: { id: string; name: string }[];
  editor?: WireEditorConfig;
}

/** Reads active pipelines and their sources from the connected server, including editor inputs. */
export async function fetchCreditPromptPipelines() {
  const options = { suppressErrorToast: true };
  const [overview, policies, permissions] = await Promise.all([
    apiClient.get<{ pipelines: CreditPromptPipeline[] }>(
      "/api/v1/policies/overview",
      options,
    ),
    apiClient.get<WirePolicy[]>("/api/v1/policies", options),
    apiClient.get<{ canManagePolicies: boolean }>(
      "/api/v1/policies/permissions",
      options,
    ),
  ]);
  const pipelines: CreditPromptPipeline[] = overview.data.pipelines
    .filter((pipeline) => pipeline.enabled)
    .map((pipeline) => ({
      ...pipeline,
      editor: policies.data.find((policy) => policy.id === pipeline.id)?.editor,
    }));
  return { pipelines, canManage: permissions.data.canManagePolicies };
}

/** Updates only enablement on a fresh server record; required policies must be managed in settings. */
export async function setCreditPromptPipelineEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const options = { suppressErrorToast: true };
  const { data: current } = await apiClient.get<WirePolicy>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
    options,
  );
  if (current.required)
    throw new Error("Required policies must be managed in pipeline settings");
  const { data: saved } = await apiClient.post<WirePolicy>(
    "/api/v1/policies",
    { ...current, enabled },
    options,
  );
  for (const [key, policy] of Object.entries(loadPolicies())) {
    if (policy.backendId === id) updatePolicy(key, { enabled: saved.enabled });
  }
}
