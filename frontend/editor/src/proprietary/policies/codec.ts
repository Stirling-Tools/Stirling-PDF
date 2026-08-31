/**
 * Bidirectional codec between the portal's frontend `PolicyDecodedState` and
 * the backend `WirePolicy`. All policy-level metadata rides in
 * `output.options`, including the `categoryId` the server reads back to find
 * egress policies. Mirrors the editor's `buildBackendPolicy` /
 * `fromBackendPolicy` from `policyPipeline.ts`, minus the editor-only
 * `automation` blob and toolRegistry coupling.
 */

import { resolveRunOn } from "@app/policies/runOn";
import type {
  PolicyDecodedState,
  WireOutputOptions,
  WirePolicy,
} from "@app/policies/types";

const DEFAULTS = {
  maxRetries: 3,
  retryDelayMinutes: 5,
} as const;

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
    trigger: null,
    steps: state.steps,
    output: { type: "inline", options },
    // Omitting this makes the backend stamp EditorConfig.disabled(), so a pause or a
    // wizard save would quietly take the policy off the editor.
    editor: { allowed: state.runsOnEditor, runOn: state.runOn },
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
  const categoryId = str(raw.categoryId);
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    categoryId,
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    runsOnEditor: policy.editor?.allowed === true,
    scopeTypes: Array.isArray(raw.scopeTypes) ? raw.scopeTypes : [],
    reviewerEmail: str(raw.reviewerEmail),
    fieldValues: raw.fieldValues ?? {},
    // The moment lives on `editor` now, but only carries meaning while the editor
    // runs it (EditorConfig coerces a disabled policy's runOn to "upload"); fall back
    // to the legacy options bag otherwise so the wizard still shows what was chosen.
    runOn: resolveRunOn(
      policy.editor?.allowed ? policy.editor.runOn : raw.runOn,
      categoryId,
    ),
    outputMode: raw.mode === "new_file" ? "new_file" : "new_version",
    outputName: str(raw.name),
    outputNamePosition: position,
    maxRetries: num(raw.maxRetries, DEFAULTS.maxRetries),
    retryDelayMinutes: num(raw.retryDelayMinutes, DEFAULTS.retryDelayMinutes),
    steps: Array.isArray(policy.steps) ? policy.steps : [],
  };
}
