import { useState, useMemo } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Button } from "@shared/components/Button";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { buildPipelineDefinition } from "@app/services/policyPipeline";
import {
  PolicyToolConfig,
  type PolicyToolState,
} from "@app/components/policies/PolicyToolConfig";
import type { ToolId } from "@app/types/toolId";
import type {
  PolicyCategory,
  PolicyConfigResult,
  PolicyFolderSettings,
  PolicyState,
} from "@app/types/policies";
import type {
  AutomationConfig,
  AutomationOperation,
} from "@app/types/automation";
import type { SmartFolder } from "@app/types/smartFolders";

interface PolicyConfigPageProps {
  category: PolicyCategory;
  state: PolicyState;
  /** The fixed, configurable tool chain for this category (locked set). */
  chainIds: string[];
  /**
   * The policy's backing automation (its saved operations + params), or null
   * when the preset hasn't been configured yet — in which case the page seeds
   * from `defaultOperations`.
   */
  automation: AutomationConfig | null;
  /** Preset default operations, used to seed an unconfigured policy. */
  defaultOperations: AutomationOperation[];
  /** Backing folder, read-only here — its output/retry settings are preserved. */
  folder: SmartFolder | null;
  onCancel: () => void;
  onComplete: (result: PolicyConfigResult) => void | Promise<void>;
}

/**
 * The locked, per-tool config page for a policy (Edit/Settings view). Renders the
 * fixed tool chain via {@link PolicyToolConfig} (generated from the registry,
 * sectioned by tool) and, on save, turns the enabled tools into the policy's
 * pipeline. Output/retry settings are read from the backing folder and passed
 * through unchanged — this page is purely about the tools.
 */
export function PolicyConfigPage({
  category,
  state,
  chainIds,
  automation,
  defaultOperations,
  folder,
  onCancel,
  onComplete,
}: PolicyConfigPageProps) {
  const { toolRegistry } = useToolWorkflow();

  // Seed each section from the policy's saved operations, or the preset defaults
  // when it hasn't been configured yet. A tool is enabled if it's in that set;
  // its params come from there, layered over the registry's defaults.
  const [tools, setTools] = useState<PolicyToolState[]>(() => {
    const seed = automation?.operations ?? defaultOperations;
    return chainIds.map((op) => {
      const saved = seed.find((o) => o.operation === op);
      const defaults =
        toolRegistry[op as ToolId]?.operationConfig?.defaultParameters ?? {};
      return {
        operation: op,
        enabled: Boolean(saved),
        parameters: { ...defaults, ...(saved?.parameters ?? {}) },
      };
    });
  });
  const [submitting, setSubmitting] = useState(false);

  // Preserve the policy's existing output/retry settings unchanged.
  const folderSettings = useMemo<PolicyFolderSettings>(
    () => ({
      outputMode: folder?.outputMode ?? "new_file",
      outputName: folder?.outputName ?? "",
      outputNamePosition: folder?.outputNamePosition ?? "prefix",
      maxRetries: folder?.maxRetries ?? 3,
      retryDelayMinutes: folder?.retryDelayMinutes ?? 5,
    }),
    [folder],
  );

  const save = () => {
    if (submitting) return;
    setSubmitting(true);
    const operations: AutomationOperation[] = tools
      .filter((t) => t.enabled)
      .map((t) => ({ operation: t.operation, parameters: t.parameters }));
    const { definition, unresolved } = buildPipelineDefinition(
      { name: automation?.name ?? `${category.label} Policy`, operations },
      toolRegistry,
    );
    Promise.resolve(
      onComplete({
        operations,
        pipelineSteps: definition.steps,
        unresolvedOps: unresolved,
        fieldValues: state.fieldValues,
        sources: state.sources,
        scopeTypes: state.scopeTypes,
        reviewerEmail: state.reviewerEmail,
        folder: folderSettings,
      }),
    ).catch(() => setSubmitting(false));
  };

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        title={`Configure ${category.label} Policy`}
        subtitle="Choose which tools this policy runs and configure each"
        onBack={onCancel}
        actions={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Cancel"
            onClick={onCancel}
            leadingIcon={<CloseIcon sx={{ fontSize: "1.1rem" }} />}
          />
        }
      />
      <div className="pol-scroll">
        <PolicyToolConfig
          tools={tools}
          toolRegistry={toolRegistry}
          onChange={setTools}
        />
      </div>
      <div className="pol-footer pol-footer-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="gradient"
          size="sm"
          onClick={save}
          disabled={submitting}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
