import { useRef } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Button } from "@shared/components/Button";
import { StatusBadge } from "@shared/components/StatusBadge";
import AutomationCreation from "@app/components/tools/automate/AutomationCreation";
import { AutomationMode } from "@app/types/automation";
import type { AutomationConfig } from "@app/types/automation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { PolicyCategory, PolicyRowStatus } from "@app/types/policies";

interface PolicySettingsFormProps {
  category: PolicyCategory;
  /** Derived display status (treats a spend-limit hit as paused). */
  status: PolicyRowStatus;
  /** The policy's backing automation — its editable workflow. Null while loading. */
  automation: AutomationConfig | null;
  /** Back to the policy's detail view. */
  onCancel: () => void;
  /** Close the policy entirely (returns to the list). */
  onClose: () => void;
  /** Called once the workflow has been saved. */
  onSaved: () => void;
}

/**
 * Edit-settings sub-view: edit the policy's actual workflow inline, reusing the
 * Watch Folders automation builder ({@link AutomationCreation}). The host drives
 * save via a trigger ref (the builder's own controls are hidden); on save the
 * backing automation is updated in place.
 */
export function PolicySettingsForm({
  category,
  status,
  automation,
  onCancel,
  onClose,
  onSaved,
}: PolicySettingsFormProps) {
  const { toolRegistry } = useToolWorkflow();
  const saveTrigger = useRef<(() => void) | null>(null);
  const isPaused = status === "paused";

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        title="Edit Settings"
        subtitle={category.label}
        onBack={onCancel}
        actions={
          <>
            <StatusBadge
              tone={isPaused ? "warning" : "success"}
              showDot
              pulse={!isPaused}
            >
              {isPaused ? "Paused" : "Active"}
            </StatusBadge>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
              leadingIcon={<CloseIcon sx={{ fontSize: "1.1rem" }} />}
            />
          </>
        }
      />

      <div className="pol-scroll">
        <p className="pol-section-label">Workflow</p>
        {automation ? (
          <AutomationCreation
            mode={AutomationMode.EDIT}
            existingAutomation={automation}
            toolRegistry={toolRegistry}
            hideMetadata
            nameOverride={automation.name}
            saveTriggerRef={saveTrigger}
            onBack={onCancel}
            onComplete={() => onSaved()}
          />
        ) : (
          <p className="pol-desc">Loading workflow…</p>
        )}
      </div>

      <div className="pol-footer pol-footer-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="gradient"
          size="sm"
          disabled={!automation}
          onClick={() => saveTrigger.current?.()}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
