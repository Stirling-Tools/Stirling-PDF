/**
 * Bidirectional codec between the portal's frontend `PolicyDecodedState` and
 * the backend `WirePolicy`. All policy-level metadata rides in
 * `output.options`; the virtual editor source lives only there, while real
 * backend sources become `inputs` entries (source + trigger) so the backend's
 * `Policy.inputs` binds them and triggers/sweeps see them. Mirrors the editor's
 * `buildBackendPolicy` / `fromBackendPolicy` from `policyPipeline.ts`, minus
 * the editor-only `automation` blob and toolRegistry coupling.
 *
 * `sources` and `inputs` are deliberately separate: `sources` is the display
 * selection the options bag has always carried unchecked, `inputs` is the
 * binding the backend validates and caps. The codec round-trips each as it
 * found it; only `policyInputs` turns a selection into a binding.
 */

import { resolveRunOn } from "@app/policies/runOn";
import type {
  PolicyDecodedState,
  WireOutputOptions,
  WirePipelineInput,
  WirePolicy,
} from "@app/policies/types";

const DEFAULTS = {
  maxRetries: 3,
  retryDelayMinutes: 5,
} as const;

/** The virtual editor source: display metadata only, never a wire sourceId. */
export const EDITOR_SOURCE_ID = "editor";

/**
 * Bind a source selection as wire inputs: the virtual editor is dropped, and
 * every real source is paired with the trigger that pulls it. Only a deliberate
 * edit binds sources, so this is the wizard's call to make - never a re-derive
 * from a decoded record, whose selection may name more sources than the backend
 * binds (see `PolicyDecodedState.inputs`).
 */
export function policyInputs(
  sources: string[],
  trigger: WirePipelineInput["trigger"],
): WirePipelineInput[] {
  return sources
    .filter((id) => id !== EDITOR_SOURCE_ID)
    .map((sourceId) => ({ sourceId, trigger }));
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
    inputs: state.inputs,
    steps: state.steps,
    output: { type: "inline", options },
    outputIds: state.outputIds,
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
  // Selection = display metadata ∪ bound inputs, so policies saved before
  // inputs were emitted (sources only in options) still round-trip complete.
  const optionSources = Array.isArray(raw.sources)
    ? (raw.sources as string[])
    : [];
  const inputs = policy.inputs ?? [];
  const sources = [
    ...new Set([...optionSources, ...inputs.map((i) => i.sourceId)]),
  ];
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    categoryId,
    sources,
    inputs,
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
    trigger: inputs.find((i) => i.trigger)?.trigger ?? null,
    outputIds: policy.outputIds ?? [],
  };
}
