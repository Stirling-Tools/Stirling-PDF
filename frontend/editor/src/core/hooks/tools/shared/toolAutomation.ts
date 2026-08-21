/**
 * Registry-level automation logic: which tools can be run as a backend operation step, how much
 * of their parameters can be edited in a UI, and conversion between a tool's frontend parameter
 * shape and the backend step contract (endpoint + backend parameters).
 *
 * This is core behaviour shared by every surface that composes or replays tool operations against
 * the backend engine (portal pipelines today; backend-executed automations and AI plans later),
 * so the "is this tool usable, and how" decision lives with the tools rather than in any one
 * feature. It builds on each tool's `operationConfig` mappers (`toApiParams` / `fromApiParams`),
 * keeping the frontend<->backend parameter mapping single-sourced in the tools.
 */

import { type ReactNode } from "react";
import {
  getToolSupportsAutomate,
  type SubcategoryId,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { type ToolId } from "@app/types/toolId";
import { TOOL_FILE_FIELDS } from "@app/types/toolApiTypes";
import {
  isToolEndpoint,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import {
  ToolType,
  type ErasedToolParams,
  type RegistryToolOperationConfig,
} from "@app/hooks/tools/shared/toolOperationTypes";

/**
 * How much of a tool's parameters a UI can edit when composing a backend step:
 * - `editable`: has both mappers and a settings UI -> render the settings UI.
 * - `noSettings`: migrated to the mapper seam but has no parameters to configure.
 * - `unsupported`: not migrated to the mapper seam -> parameters can't be mapped for editing yet;
 *   the step runs with the backend's defaults.
 */
export type ToolStepSupport = "editable" | "noSettings" | "unsupported";

/** A tool that can be added to a backend operation chain, with its editing support. */
export interface ExecutableTool {
  toolId: ToolId;
  name: string;
  icon: ReactNode;
  /** Subcategory the tool belongs to, so a picker can group tools without re-reading the registry. */
  subcategoryId: SubcategoryId;
  /** Endpoint resolved from default parameters, for display/inclusion. The stored step's endpoint is re-resolved from the configured parameters at serialization time. */
  endpoint: ToolEndpoint;
  /**
   * For a format-routed tool (one dynamic endpoint over a declared set, e.g. convert), the full set
   * it may resolve to. A picker can then judge compatibility against any of them rather than the one
   * representative `endpoint`. Absent for a single-endpoint tool.
   */
  endpoints?: readonly ToolEndpoint[];
  support: ToolStepSupport;
}

/**
 * The backend step contract: an endpoint path plus its backend-shaped parameters. `operation` is a
 * plain string, not a {@link ToolEndpoint}, because this is the raw backend boundary (it mirrors
 * the stored policy step) and a pipeline may reference endpoints the frontend does not model.
 */
export interface ToolApiStep {
  operation: string;
  parameters: Record<string, unknown>;
  /**
   * Supporting-file bindings: a backend file field (e.g. `stampImage`, `overlayFiles`) mapped to
   * `asset:<id>[,<id>]` (stored supporting files) or a run-supplied key. Absent when the step needs
   * no supporting file. Mirrors the wire {@code PipelineStep.fileParameters}.
   */
  fileParameters?: SupportingFileBindings;
}

/** A step being edited in a UI that maps to a known tool: parameters are in the tool's frontend shape. */
export interface KnownToolStep {
  toolId: ToolId;
  operation: ToolEndpoint;
  params: ErasedToolParams;
  support: ToolStepSupport;
  /**
   * Stored supporting-file bindings carried from a saved step (field -> `asset:<id>`), so an edit
   * round-trips them without the user re-picking. A field the user re-picks lands in `params` as a
   * File and takes precedence on save.
   */
  fileParameters?: SupportingFileBindings;
}

/** A stored step whose endpoint maps to no known tool: preserved verbatim, not editable. */
export interface UnknownToolStep {
  toolId: null;
  operation: string;
  params: ErasedToolParams;
  support: "unknown";
  /** Supporting-file bindings preserved verbatim, so an unknown step's files round-trip untouched. */
  fileParameters?: SupportingFileBindings;
}

/** A step being edited in a UI, discriminated by whether its endpoint maps to a known tool. */
export type WorkingToolStep = KnownToolStep | UnknownToolStep;

/**
 * Resolve a tool's endpoint from parameters. Static endpoints ignore params; dynamic ones may
 * return undefined if the params don't determine one. The result is validated against the generated
 * endpoint set (via {@link isToolEndpoint}) rather than cast, so a config endpoint that is not a
 * known {@link ToolEndpoint} (e.g. a custom tool's arbitrary string) resolves to undefined.
 */
function resolveEndpoint(
  config: RegistryToolOperationConfig | undefined,
  params: ErasedToolParams,
): ToolEndpoint | undefined {
  const endpoint = config?.endpoint;
  if (typeof endpoint === "string") {
    return isToolEndpoint(endpoint) ? endpoint : undefined;
  }
  if (typeof endpoint === "function") {
    const resolved = safeCall(endpoint, params);
    return typeof resolved === "string" && isToolEndpoint(resolved)
      ? resolved
      : undefined;
  }
  return undefined;
}

/** Invoke a dynamic-endpoint function defensively; a throw means the params don't determine one. */
function safeCall(
  fn: (params: ErasedToolParams) => string | null | undefined,
  params: ErasedToolParams,
): string | null | undefined {
  try {
    return fn(params);
  } catch {
    return undefined;
  }
}

/** Classify how much of a tool's parameters a UI can edit when composing a step. */
export function classifyToolStepSupport(
  entry: ToolRegistryEntry,
): ToolStepSupport {
  const config = entry.operationConfig;
  const hasMappers = Boolean(config?.toApiParams && config?.fromApiParams);
  if (!hasMappers) return "unsupported";
  return entry.automationSettings ? "editable" : "noSettings";
}

function isFileValue(value: unknown): boolean {
  if (typeof File === "undefined") return false;
  if (value instanceof File) return true;
  return Array.isArray(value) && value.some((item) => item instanceof File);
}

/**
 * A stored supporting-file id, as returned by the asset store.
 */
declare const ASSET_ID_BRAND: unique symbol;
export type AssetId = string & { readonly [ASSET_ID_BRAND]: never };

/**
 * A step's supporting-file bindings: each backend file field (e.g. `stampImage`) mapped to its file.
 * A value of `asset:<id>[,<id>]` names stored assets loaded at run time; any other value is a key for
 * a file supplied with the run itself.
 */
export type SupportingFileBindings = Record<string, string>;

/**
 * The `fileParameters` binding format shared with the backend (see PolicyAssetRefs). This module owns
 * the frontend side of the step contract, so the format lives here and the builder/settings reuse it.
 */
export const ASSET_REF_PREFIX = "asset:";

/** A `fileParameters` value binding one tool file field to the given stored asset ids. */
export function assetRef(ids: readonly AssetId[]): string {
  return ASSET_REF_PREFIX + ids.join(",");
}

/** The stored asset ids inside a binding value, or none when it isn't an `asset:` ref. */
export function assetRefIds(binding: string): AssetId[] {
  if (!binding.startsWith(ASSET_REF_PREFIX)) return [];
  return binding
    .slice(ASSET_REF_PREFIX.length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean) as AssetId[];
}

/** A throwaway primary document for probing a tool's buildFormData; never sent anywhere. */
function dummyPrimaryFile(): File {
  return new File([], "input.pdf", { type: "application/pdf" });
}

/**
 * Run a tool's buildFormData so we can read the request it would produce.
 * Returns null when File is unavailable or buildFormData throws.
 */
function probeFormData(
  config: RegistryToolOperationConfig,
  params: ErasedToolParams,
): FormData | null {
  if (typeof File === "undefined") return null;
  const dummy = dummyPrimaryFile();
  try {
    switch (config.toolType) {
      case ToolType.singleFile:
        return config.buildFormData(params, dummy);
      case ToolType.multiFile:
        return config.buildFormData(params, [dummy]);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Defaults merged under the step's params - the shape a tool's mappers and buildFormData expect. */
function mergedStepParams(
  step: WorkingToolStep,
  config: RegistryToolOperationConfig,
): ErasedToolParams {
  return { ...(config.defaultParameters ?? {}), ...step.params };
}

/** The backend file fields an endpoint accepts, from the generated spec-sourced table. */
function backendFileFields(operation: string): readonly string[] {
  return (
    (TOOL_FILE_FIELDS as Partial<Record<string, readonly string[]>>)[
      operation
    ] ?? []
  );
}

/**
 * Each backend file field the step's endpoint accepts (from {@link TOOL_FILE_FIELDS}), mapped to the
 * tool param that holds it - the same name unless the tool declared a rename override.
 */
function fileFieldMappings(
  operation: string,
  config: RegistryToolOperationConfig,
): { field: string; param: string }[] {
  // The override's erased type collapses `param` to `never`; restore the real runtime shape.
  const overrides = (config.fileParamOverrides ?? []) as readonly {
    field: string;
    param: string;
  }[];
  const paramByField = new Map(overrides.map((o) => [o.field, o.param]));
  return backendFileFields(operation).map((field) => ({
    field,
    param: paramByField.get(field) ?? field,
  }));
}

/**
 * The step's params with a stand-in File array injected for each stored binding whose param has no
 * fresh pick, so a tool's buildFormData/validateParams sees the supporting file as present. Stored
 * bindings are keyed by the backend field (from {@link TOOL_FILE_FIELDS}), so each field finds its
 * binding and the sentinel lands on its param - the two coincide unless the tool declared a rename
 * override. The array is sized to the binding's asset count (overlay validates count == file count).
 * Sentinels are empty and live only in this local object - never written back to step.params, so they
 * can never be uploaded.
 */
function withStoredFileSentinels(
  step: WorkingToolStep,
  config: RegistryToolOperationConfig,
): ErasedToolParams {
  const merged = mergedStepParams(step, config);
  const bindings = step.fileParameters;
  if (!bindings || typeof File === "undefined") return merged;
  for (const { param, field } of fileFieldMappings(step.operation, config)) {
    const binding = bindings[field];
    if (binding == null || isFileValue(merged[param])) continue; // unbound, or a fresh pick stands in
    const count = Math.max(1, assetRefIds(binding).length);
    merged[param] = Array.from({ length: count }, () => new File([], "stored"));
  }
  return merged;
}

/**
 * The fresh File picks on a step, grouped by the backend file field its buildFormData sends them
 * under (excluding the primary `fileInput`). buildFormData is the source of truth for the field name
 * and for tool-specific selection (certSign picks files by certType), so probing it - rather than
 * scanning params - keeps the field mapping correct. These are the files to upload on save.
 */
export function extractStepFiles(
  step: WorkingToolStep,
  registry: Partial<ToolRegistry>,
): Record<string, File[]> {
  if (step.toolId === null) return {};
  const config = registry[step.toolId]?.operationConfig;
  if (!config) return {};
  const formData = probeFormData(config, mergedStepParams(step, config));
  if (!formData) return {};
  const files: Record<string, File[]> = {};
  formData.forEach((value, key) => {
    if (key !== "fileInput" && value instanceof File) {
      (files[key] ??= []).push(value);
    }
  });
  return files;
}

/**
 * The backend file fields this step actually uses right now, per its own buildFormData: fresh picks
 * plus any stored binding the tool still emits (a stale one - e.g. a PKCS12 keystore after switching
 * to PEM - is dropped, because buildFormData no longer sends it). Drives the stored-file chips, the
 * save-time binding set, and the test run.
 */
export function activeFileFields(
  step: WorkingToolStep,
  registry: Partial<ToolRegistry>,
): string[] | null {
  if (step.toolId === null) {
    return step.fileParameters ? Object.keys(step.fileParameters) : [];
  }
  const config = registry[step.toolId]?.operationConfig;
  if (!config) return null;
  const formData = probeFormData(config, withStoredFileSentinels(step, config));
  if (!formData) return null;
  const fields = new Set<string>();
  formData.forEach((value, key) => {
    if (key !== "fileInput" && value instanceof File) fields.add(key);
  });
  return [...fields];
}

/**
 * True if a step still needs the user to make a choice before it can run - the tool declares some
 * of its parameters mandatory and this step has not filled them in yet.
 *
 * This asks the tool the same question its own Run button asks (`validateParams` is the predicate
 * the tool passes `useBaseParameters` as `validateFn`), so a step is "configured" in a pipeline
 * exactly when it would be runnable in the editor. Tools that declare no predicate run happily on
 * their defaults, and an unknown step is nobody's to judge.
 */
export function stepNeedsConfiguring(
  step: WorkingToolStep,
  registry: Partial<ToolRegistry>,
): boolean {
  if (step.toolId === null) return false;
  const config = registry[step.toolId]?.operationConfig;
  if (!config || !config.validateParams) return false;
  // Stored supporting files satisfy their field just as a fresh pick would, so validate against the
  // sentinel-injected params rather than the bare ones (which drop the file on reload).
  return !config.validateParams(withStoredFileSentinels(step, config));
}

/**
 * The tools that can be run as a backend operation step, sorted by name. Includes automatable tools
 * whose endpoint resolves from defaults, plus format-routed tools (e.g. convert) whose endpoint only
 * resolves once configured but that declare their routing set - represented by the first endpoint of
 * that set. Drops tools with no operationConfig and no way to name a backend endpoint at all.
 */
export function getExecutableTools(
  registry: Partial<ToolRegistry>,
): ExecutableTool[] {
  const tools: ExecutableTool[] = [];
  for (const [id, entry] of Object.entries(registry)) {
    if (!entry || !getToolSupportsAutomate(entry)) continue;
    const config = entry.operationConfig;
    if (!config) continue;
    // A configured endpoint from defaults, else the routing set's first member as a stand-in so a
    // tool that only resolves once the user picks (convert's from/to) can still be offered.
    const endpoint =
      resolveEndpoint(config, config.defaultParameters ?? {}) ??
      config.endpoints?.find(isToolEndpoint);
    if (!endpoint) continue;
    tools.push({
      toolId: id as ToolId,
      name: entry.name,
      icon: entry.icon,
      subcategoryId: entry.subcategoryId,
      endpoint,
      endpoints: config.endpoints,
      support: classifyToolStepSupport(entry),
    });
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/** A fresh working step for a tool just added to a chain, seeded with its default parameters. */
export function newWorkingToolStep(
  tool: ExecutableTool,
  registry: Partial<ToolRegistry>,
): KnownToolStep {
  const config = registry[tool.toolId]?.operationConfig;
  return {
    toolId: tool.toolId,
    operation: tool.endpoint,
    params: { ...(config?.defaultParameters ?? {}) },
    support: tool.support,
  };
}

/**
 * Apply edited parameters to a working step, re-resolving its endpoint from them. A format-routed
 * tool changes which endpoint it targets as its routing parameters change (convert's from/to,
 * split's method), so the working step's `operation` must track the params to keep live chain
 * validation and the carried output format honest - not just at serialization time. The operation
 * is left unchanged when the new params don't resolve one, or the step maps to no known tool.
 */
export function updateWorkingStepParams(
  step: WorkingToolStep,
  params: ErasedToolParams,
  registry: Partial<ToolRegistry>,
): WorkingToolStep {
  const next = { ...step, params };
  if (next.toolId === null) return next;
  const config = registry[next.toolId]?.operationConfig;
  if (!config) return next;
  const merged = { ...(config.defaultParameters ?? {}), ...params };
  const operation = resolveEndpoint(config, merged);
  return operation ? { ...next, operation } : next;
}

/** Serialize a working step into the backend step contract (endpoint + backend parameters). */
export function serializeToolStep(
  step: WorkingToolStep,
  registry: Partial<ToolRegistry>,
): ToolApiStep {
  const config =
    step.toolId !== null ? registry[step.toolId]?.operationConfig : undefined;
  if (!config) {
    // Unmapped step (unknown endpoint on edit): round-trip it unchanged.
    return withFileParameters(
      { operation: step.operation, parameters: step.params },
      step,
    );
  }
  const merged = { ...(config.defaultParameters ?? {}), ...step.params };
  const operation = resolveEndpoint(config, merged) ?? step.operation;
  const parameters = config.toApiParams
    ? (config.toApiParams(merged) as Record<string, unknown>)
    : {};
  return withFileParameters({ operation, parameters }, step);
}

/** Attach the step's supporting-file bindings to a serialized step, omitting the field when empty. */
function withFileParameters(
  serialized: ToolApiStep,
  step: WorkingToolStep,
): ToolApiStep {
  const bindings = step.fileParameters;
  if (!bindings || Object.keys(bindings).length === 0) return serialized;
  return { ...serialized, fileParameters: bindings };
}

/**
 * Find the registry tool for a stored step's endpoint: exact match for static endpoints, else
 * membership in a dynamic tool's declared `endpoints` set (replaying its function can't recover a
 * frontend-only routing field). Replay is only the fallback when no set is declared.
 */
function findToolByEndpoint(
  step: ToolApiStep,
  registry: Partial<ToolRegistry>,
): [ToolId, ToolRegistryEntry] | undefined {
  const staticMatches: [ToolId, ToolRegistryEntry][] = [];
  let dynamic: [ToolId, ToolRegistryEntry] | undefined;
  for (const [id, entry] of Object.entries(registry)) {
    const endpoint = entry?.operationConfig?.endpoint;
    if (typeof endpoint === "string") {
      if (endpoint === step.operation)
        staticMatches.push([id as ToolId, entry]);
    } else if (typeof endpoint === "function" && !dynamic) {
      const declared = entry?.operationConfig?.endpoints;
      const matched = declared
        ? declared.some((e) => e === step.operation)
        : safeCall(endpoint, step.parameters) === step.operation;
      if (matched) dynamic = [id as ToolId, entry];
    }
  }
  if (staticMatches.length > 0) {
    return disambiguateStaticMatches(staticMatches, step.parameters);
  }
  return dynamic;
}

/**
 * Most endpoints belong to one tool, so the single match is returned unchanged. When several
 * share an endpoint (Add Password and its permissions-only alias Change Permissions), prefer the
 * specialised tool that claims the stored parameters; otherwise fall back to the general owner
 * that declares no such claim.
 */
function disambiguateStaticMatches(
  matches: [ToolId, ToolRegistryEntry][],
  parameters: Record<string, unknown>,
): [ToolId, ToolRegistryEntry] {
  if (matches.length === 1) return matches[0];
  const claimed = matches.find(([, entry]) =>
    entry.operationConfig?.claimsStoredStep?.(parameters),
  );
  if (claimed) return claimed;
  const general = matches.find(
    ([, entry]) => !entry.operationConfig?.claimsStoredStep,
  );
  return general ?? matches[0];
}

/** A stored step kept verbatim because its endpoint maps to no known tool. */
function unmappedStep(step: ToolApiStep): UnknownToolStep {
  return {
    toolId: null,
    operation: step.operation,
    params: { ...step.parameters },
    support: "unknown",
    fileParameters: step.fileParameters,
  };
}

/**
 * Rehydrate a stored backend step into a working step for editing: map the endpoint back to a tool
 * and its backend parameters back to the frontend shape via `fromApiParams`. Steps whose endpoint
 * maps to no known tool are kept as an unmapped, non-editable working step (parameters preserved).
 */
export function deserializeToolStep(
  step: ToolApiStep,
  registry: Partial<ToolRegistry>,
): WorkingToolStep {
  const match = findToolByEndpoint(step, registry);
  if (!match) return unmappedStep(step);
  const [toolId, entry] = match;
  const config = entry.operationConfig;
  // Mappers echo missing stored fields as explicit `undefined`, which would
  // clobber the default underneath; strip those so defaults always win.
  const mapped = config?.fromApiParams
    ? Object.fromEntries(
        Object.entries(
          config.fromApiParams(step.parameters as never) as Record<
            string,
            unknown
          >,
        ).filter(([, value]) => value !== undefined),
      )
    : {};
  const params: ErasedToolParams = {
    ...(config?.defaultParameters ?? {}),
    ...mapped,
  } as ErasedToolParams;
  // Validate against the generated endpoint set instead of casting the matched string.
  const operation =
    resolveEndpoint(config, params) ??
    (isToolEndpoint(step.operation) ? step.operation : undefined);
  if (operation === undefined) return unmappedStep(step);
  return {
    toolId,
    operation,
    params,
    support: classifyToolStepSupport(entry),
    fileParameters: step.fileParameters,
  };
}
