import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { usePortalAccess } from "@editor/hooks/usePortalAccess";
import { HAS_PORTAL } from "@editor/routes/hasPortal";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";
import { saveEditorReturnPath } from "@editor/services/workbenchSession";
import {
  getExecutableTools,
  newWorkingToolStep,
  serializeToolStep,
  updateWorkingStepParams,
} from "@editor/hooks/tools/shared/toolAutomation";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import type { AutomationConfig } from "@editor/types/automation";
import type { PipelineOpener } from "@editor-core/hooks/tools/automate/useOpenAsPipeline";
import type { Policy } from "@processor/api/pipelines";

export type { PipelineOpener };

const NEW_PIPELINE_PATH = `${PORTAL_BASENAME}/pipelines/new`;

/**
 * The automation as an unsaved pipeline with no source or destination yet. Null when
 * any step is not a tool the Processor can run: dropping it would save a pipeline that
 * silently does less than the automation did.
 */
export function automationToPipelineDraft(
  automation: AutomationConfig,
  registry: Partial<ToolRegistry>,
  executable = getExecutableTools(registry),
): Policy | null {
  if (automation.operations.length === 0) return null;
  const steps = [];
  for (const op of automation.operations) {
    const tool = executable.find((entry) => entry.toolId === op.operation);
    if (!tool) return null;
    const step = updateWorkingStepParams(
      newWorkingToolStep(tool, registry),
      op.parameters,
      registry,
    );
    steps.push(serializeToolStep(step, registry));
  }
  return {
    name: automation.name,
    enabled: true,
    inputs: [],
    steps,
    output: { type: "inline", options: {} },
    outputIds: [],
  };
}

export function useOpenAsPipeline(): PipelineOpener {
  const { allTools } = useToolRegistry();
  const portalAccess = usePortalAccess();
  const navigate = useNavigate();
  const { actions } = useNavigationActions();

  const executable = useMemo(() => getExecutableTools(allTools), [allTools]);

  return (automation) => {
    if (!HAS_PORTAL || !portalAccess) return null;
    let draft: Policy | null;
    try {
      draft = automationToPipelineDraft(automation, allTools, executable);
    } catch (error) {
      // Runs while rendering every row: stored parameters a tool cannot map must
      // cost this one menu item, not the whole panel.
      console.warn("Cannot offer this automation as a pipeline:", error);
      return null;
    }
    if (!draft) return null;
    return () =>
      // Through the guard, so unsaved edits get the same warning as any other navigation.
      actions.requestNavigation(() => {
        saveEditorReturnPath();
        navigate(NEW_PIPELINE_PATH, { state: { draft } });
      });
  };
}
