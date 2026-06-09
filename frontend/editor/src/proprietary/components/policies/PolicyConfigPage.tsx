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
  PolicyFolderSettings,
  PolicyState,
  PolicyWizardResult,
} from "@app/types/policies";
import type { AutomationConfig } from "@app/types/automation";
import type { SmartFolder } from "@app/types/smartFolders";

interface PolicyConfigPageProps {
  category: PolicyCategory;
  state: PolicyState;
  /** The fixed, configurable tool chain for this category (locked set). */
  chainIds: string[];
  /** The policy's backing automation — its currently-saved operations + params. */
  automation: AutomationConfig;
  /** Backing folder, read-only here — its output/retry settings are preserved. */
  folder: SmartFolder | null;
  onCancel: () => void;
  onComplete: (result: PolicyWizardResult) => void | Promise<void>;
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
  folder,
  onCancel,
  onComplete,
}: PolicyConfigPageProps) {
  const { toolRegistry } = useToolWorkflow();

  // Seed each section from the saved operation (enabled + its params) or, if the
  // policy doesn't run that tool yet, from the registry's default parameters.
  const [tools, setTools] = useState<PolicyToolState[]>(() =>
    chainIds.map((op) => {
      const saved = automation.operations.find((o) => o.operation === op);
      const defaults =
        toolRegistry[op as ToolId]?.operationConfig?.defaultParameters ?? {};
      return {
        operation: op,
        enabled: Boolean(saved),
        parameters: { ...defaults, ...(saved?.parameters ?? {}) },
      };
    }),
  );
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
    const operations = tools
      .filter((t) => t.enabled)
      .map((t) => ({ operation: t.operation, parameters: t.parameters }));
    const nextAutomation: AutomationConfig = { ...automation, operations };
    const { definition, unresolved } = buildPipelineDefinition(
      nextAutomation,
      toolRegistry,
    );
    Promise.resolve(
      onComplete({
        automation: nextAutomation,
        fieldValues: state.fieldValues,
        sources: state.sources,
        scopeTypes: state.scopeTypes,
        reviewerEmail: state.reviewerEmail,
        folder: folderSettings,
        pipelineSteps: definition.steps,
        unresolvedOps: unresolved,
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
