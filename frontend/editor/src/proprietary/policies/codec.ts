/**
 * Bidirectional codec between the portal's frontend `PolicyDecodedState` and
 * the backend `WirePolicy`. All policy-level metadata rides in
 * `output.options`; `trigger` is null except for egress policies, which the
 * server fires itself. Mirrors the editor's `buildBackendPolicy` /
 * `fromBackendPolicy` from `policyPipeline.ts`, minus the editor-only
 * `automation` blob and toolRegistry coupling.
 */

import type {
  PolicyDecodedState,
  WireOutputOptions,
  WirePolicy,
  WireTriggerConfig,
} from "@app/policies/types";

const DEFAULTS = {
  maxRetries: 3,
  retryDelayMinutes: 5,
} as const;

/** Category ids the backend must fire itself, and the trigger type each uses. */
const SERVER_TRIGGERS: Record<string, string> = {
  sharing: "share",
};

function triggerFor(categoryId: string): WireTriggerConfig | null {
  const type = SERVER_TRIGGERS[categoryId];
  return type ? { type, options: {} } : null;
}

export function toWirePolicy(state: PolicyDecodedState): WirePolicy {
  const options: WireOutputOptions = {
    runOn: state.runOn,
    mode: state.outputMode,
    name: state.outputName,
    position: state.outputNamePosition,
    maxRetries: state.maxRetries,
    retryDelayMinutes: state.retryDelayMinutes,
    categoryId: state.categoryId,
    sources: state.sources,
    scopeTypes: state.scopeTypes,
    reviewerEmail: state.reviewerEmail,
    fieldValues: state.fieldValues,
  };
  return {
    id: state.id,
    name: state.name,
    owner: "",
    enabled: state.enabled,
    trigger: triggerFor(state.categoryId),
    steps: state.steps,
    output: { type: "inline", options },
  };
}

export function fromWirePolicy(policy: WirePolicy): PolicyDecodedState {
  const raw = policy.output?.options ?? {};
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" ? v : fallback;
  const position =
    raw.position === "suffix"
      ? "suffix"
      : raw.position === "auto-number"
        ? "auto-number"
        : "prefix";
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    categoryId: str(raw.categoryId),
    sources: Array.isArray(raw.sources) ? (raw.sources as string[]) : [],
    scopeTypes: Array.isArray(raw.scopeTypes)
      ? (raw.scopeTypes as string[])
      : [],
    reviewerEmail: str(raw.reviewerEmail),
    fieldValues: raw.fieldValues ?? {},
    runOn: raw.runOn === "export" ? "export" : "upload",
    outputMode: raw.mode === "new_file" ? "new_file" : "new_version",
    outputName: str(raw.name),
    outputNamePosition: position,
    maxRetries: num(raw.maxRetries, DEFAULTS.maxRetries),
    retryDelayMinutes: num(raw.retryDelayMinutes, DEFAULTS.retryDelayMinutes),
    steps: Array.isArray(policy.steps) ? policy.steps : [],
  };
}
