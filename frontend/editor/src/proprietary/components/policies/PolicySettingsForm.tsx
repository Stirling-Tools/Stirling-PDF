import { useState } from "react";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { StatusBadge } from "@shared/components/StatusBadge";
import type {
  PolicyCategory,
  PolicyConfigDef,
  PolicyRowStatus,
  PolicyState,
} from "@app/types/policies";
import { PolicyFieldRow } from "@app/components/policies/PolicyFieldRow";
import { resolveFieldValues } from "@app/components/policies/policyValues";

interface PolicySettingsFormProps {
  category: PolicyCategory;
  config: PolicyConfigDef;
  state: PolicyState;
  /** Derived display status (treats a spend-limit hit as paused). */
  status: PolicyRowStatus;
  onCancel: () => void;
  onSave: (fieldValues: Record<string, boolean | string | string[]>) => void;
}

/** Edit-settings sub-view for an already-configured policy. */
export function PolicySettingsForm({
  category,
  config,
  state,
  status,
  onCancel,
  onSave,
}: PolicySettingsFormProps) {
  const [fieldValues, setFieldValues] = useState(() =>
    resolveFieldValues(config, state),
  );
  const isPaused = status === "paused";

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        title="Edit Settings"
        subtitle={category.label}
        onBack={onCancel}
        actions={
          <StatusBadge tone={isPaused ? "warning" : "success"} showDot>
            {isPaused ? "Paused" : "Active"}
          </StatusBadge>
        }
      />

      <div className="pol-scroll">
        <Card padding="none">
          {config.fields.map((f, i) => (
            <PolicyFieldRow
              key={f.key}
              field={f}
              value={fieldValues[f.key]}
              first={i === 0}
              onChange={(v) =>
                setFieldValues((prev) => ({ ...prev, [f.key]: v }))
              }
            />
          ))}
        </Card>
      </div>

      <div className="pol-footer pol-footer-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="gradient"
          size="sm"
          onClick={() => onSave(fieldValues)}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
