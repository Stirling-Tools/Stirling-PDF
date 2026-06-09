import { useState, useEffect, type MutableRefObject } from "react";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { buildPipelineDefinition } from "@app/services/policyPipeline";
import {
  PolicyToolConfig,
  type PolicyToolState,
} from "@app/components/policies/PolicyToolConfig";
import type { ToolId } from "@app/types/toolId";
import type { AutomationOperation } from "@app/types/automation";

interface PolicyToolConfigStepProps {
  /** The fixed, configurable tool chain (locked set) for this policy. */
  chainIds: string[];
  /** Operations to seed enabled/params from (saved ops, or preset defaults). */
  initialOperations: AutomationOperation[];
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
  categoryLabel,
  saveTriggerRef,
  onComplete,
}: PolicyToolConfigStepProps) {
  const { toolRegistry } = useToolWorkflow();

  const [tools, setTools] = useState<PolicyToolState[]>(() =>
    chainIds.map((op) => {
      const saved = initialOperations.find((o) => o.operation === op);
      const defaults =
        toolRegistry[op as ToolId]?.operationConfig?.defaultParameters ?? {};
      return {
        operation: op,
        enabled: Boolean(saved),
        parameters: { ...defaults, ...(saved?.parameters ?? {}) },
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
