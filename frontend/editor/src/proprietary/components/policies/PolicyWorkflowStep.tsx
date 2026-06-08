import type { MutableRefObject } from "react";
import AutomationCreation from "@app/components/tools/automate/AutomationCreation";
import { AutomationMode } from "@app/types/automation";
import type { AutomationConfig } from "@app/types/automation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";

interface PolicyWorkflowStepProps {
  /**
   * The automation to seed/edit. For setup this is a synthetic config carrying
   * the category preset's operations; for edit it's the policy's backing
   * automation.
   */
  automation: AutomationConfig;
  /** SUGGESTED seeds-then-creates (setup); EDIT updates in place (settings). */
  mode: AutomationMode;
  /** The host (wizard) triggers the builder's save imperatively from its footer. */
  saveTriggerRef: MutableRefObject<(() => void) | null>;
  /** Called with the saved automation once the builder persists it. */
  onComplete: (automation: AutomationConfig) => void;
  /** Called when save is triggered but the workflow isn't in a saveable state. */
  onSaveFailed?: () => void;
}

/**
 * The policy wizard's "Workflow" step: the Watch Folders automation builder
 * ({@link AutomationCreation}) reused to define a policy's tool pipeline. Kept
 * as its own component so the heavy builder + its ToolWorkflow dependency are
 * isolated (and mockable in the rail tests).
 */
export function PolicyWorkflowStep({
  automation,
  mode,
  saveTriggerRef,
  onComplete,
  onSaveFailed,
}: PolicyWorkflowStepProps) {
  const { toolRegistry } = useToolWorkflow();
  return (
    <AutomationCreation
      mode={mode}
      existingAutomation={automation}
      toolRegistry={toolRegistry}
      hideMetadata
      nameOverride={automation.name}
      saveTriggerRef={saveTriggerRef}
      onBack={() => {}}
      onComplete={onComplete}
      onSaveFailed={onSaveFailed}
    />
  );
}

export { AutomationMode };
