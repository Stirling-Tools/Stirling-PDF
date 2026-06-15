import { useState, useEffect, type MutableRefObject } from "react";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { buildPipelineDefinition } from "@app/services/policyPipeline";
import {
  PolicyToolConfig,
  type PolicyToolState,
} from "@app/components/policies/PolicyToolConfig";
import type { ToolId } from "@app/types/toolId";
import type { AutomationOperation } from "@app/types/automation";

/**
 * Seed a tool's parameters: start from the tool's own registry defaults, overlay
 * the preset's defaults (e.g. the PII patterns), then apply only the saved
 * values the user actually changed from the tool default. This means a policy
 * saved while a param was at its default (an empty redact list) still inherits
 * the preset value, while genuine user edits are preserved.
 */
function seedToolParameters(
  registryDefaults: Record<string, unknown>,
  presetParams: Record<string, unknown>,
  savedParams: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...registryDefaults,
    ...presetParams,
  };
  const eq = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  for (const [key, value] of Object.entries(savedParams)) {
    if (!eq(value, registryDefaults[key])) merged[key] = value;
  }
  return merged;
}

interface PolicyToolConfigStepProps {
  /** The fixed, configurable tool chain (locked set) for this policy. */
  chainIds: string[];
  /** Operations to seed enabled/params from (saved ops, or preset defaults). */
  initialOperations: AutomationOperation[];
  /**
   * The preset's default operations. Their params seed any tool whose saved
   * value is still at the tool's own default — so e.g. a policy saved with the
   * PII list at its default inherits the preset patterns rather than running empty.
   */
  presetOperations: AutomationOperation[];
  /** Used to name the built pipeline definition. */
  categoryLabel: string;
  /** The wizard triggers this on its final submit (mirrors PolicyWorkflowStep). */
  saveTriggerRef: MutableRefObject<(() => void) | null>;
  /** Emits the enabled tools as operations + the endpoint-mapped backend steps. */
  onComplete: (
    operations: AutomationOperation[],
    pipelineSteps: { operation: string; parameters: Record<string, unknown> }[],
    unresolvedOps: string[],
  ) => void;
}

/**
 * The wizard's Workflow step for preset (tool-chain) policies: the locked,
 * per-tool config ({@link PolicyToolConfig}) instead of the add/remove builder.
 * Isolates the ToolWorkflow dependency (so it's mockable in the rail tests) and
 * wires the wizard's submit trigger to emit the configured tools as operations
 * + the endpoint-mapped pipeline steps.
 */
export function PolicyToolConfigStep({
  chainIds,
  initialOperations,
  presetOperations,
  categoryLabel,
  saveTriggerRef,
  onComplete,
}: PolicyToolConfigStepProps) {
  const { toolRegistry } = useToolWorkflow();

  const [tools, setTools] = useState<PolicyToolState[]>(() =>
    chainIds.map((op) => {
      const saved = initialOperations.find((o) => o.operation === op);
      const preset = presetOperations.find((o) => o.operation === op);
      const defaults = (toolRegistry[op as ToolId]?.operationConfig
        ?.defaultParameters ?? {}) as Record<string, unknown>;
      return {
        operation: op,
        enabled: Boolean(saved),
        parameters: seedToolParameters(
          defaults,
          (preset?.parameters ?? {}) as Record<string, unknown>,
          (saved?.parameters ?? {}) as Record<string, unknown>,
        ),
      };
    }),
  );

  // Re-wire the submit trigger whenever the tools change so it emits the latest.
  useEffect(() => {
    saveTriggerRef.current = () => {
      const operations: AutomationOperation[] = tools
        .filter((t) => t.enabled)
        .map((t) => ({ operation: t.operation, parameters: t.parameters }));
      const { definition, unresolved } = buildPipelineDefinition(
        { name: `${categoryLabel} Policy`, operations },
        toolRegistry,
      );
      onComplete(operations, definition.steps, unresolved);
    };
  }, [tools, toolRegistry, categoryLabel, saveTriggerRef, onComplete]);

  return (
    <PolicyToolConfig
      tools={tools}
      toolRegistry={toolRegistry}
      onChange={setTools}
    />
  );
}
