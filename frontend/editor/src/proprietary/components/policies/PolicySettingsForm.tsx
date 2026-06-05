import { useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
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

  return (
    <div className="pol-detail">
      <div className="pol-header">
        <button className="pol-icon-btn" onClick={onCancel} aria-label="Back">
          <ChevronLeftIcon sx={{ fontSize: "1.1rem" }} />
        </button>
        <span className="pol-header-icon">{category.icon}</span>
        <div className="pol-header-text">
          {/* Prototype titles this sub-view "Edit Settings"; the policy it edits
              stays identifiable via the category icon to the left. */}
          <span className="pol-header-title">Edit Settings</span>
          {state.docsEnforced24h > 0 && (
            <span className="pol-header-sub">
              {`${state.docsEnforced24h} enforced today`}
            </span>
          )}
        </div>
        {status === "paused" ? (
          <span className="pol-badge pol-badge-paused">Paused</span>
        ) : (
          <span className="pol-badge pol-badge-active">
            <span className="pol-badge-dot" />
            Active
          </span>
        )}
      </div>

      <div className="pol-scroll">
        <div className="pol-card">
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
        </div>
      </div>

      <div className="pol-footer pol-footer-end">
        <button className="pol-btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button className="pol-btn-primary" onClick={() => onSave(fieldValues)}>
          Save Changes
        </button>
      </div>
    </div>
  );
}
