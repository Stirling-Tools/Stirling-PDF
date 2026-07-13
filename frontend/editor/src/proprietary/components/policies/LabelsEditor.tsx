// Editor for a classification-label list. Two views (dropdown, grouped by
// default): a flat chip grid, or the shared {@link ClassificationCategoryManager}
// that lays labels out under their (personal, device-local) sidebar categories
// and owns Select mode + bulk actions (delete, add-to-category, hide).
//
// Categories + hidden labels are controlled by the caller (staged until "Save for
// team" in the processor), so nothing here writes them to storage directly.

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import { Button } from "@app/ui/Button";
import { Select } from "@app/ui/Select";
import { LabelChip } from "@app/ui/LabelChip";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { ClassificationCategoryManager } from "@app/components/policies/ClassificationCategoryManager";
import type { SidebarCategory } from "@app/services/fileSidebarCategories";
import {
  labelId,
  type ClassificationLabel,
} from "@app/data/classificationLabels";

const MAX_TEXT_LENGTH = 128;

interface LabelsEditorProps {
  value: ClassificationLabel[];
  onChange: (next: ClassificationLabel[]) => void;
  readOnly?: boolean;
  /** Names that can't be added here because another set already owns them. */
  reservedNames?: string[];
  addPlaceholder?: string;
  emptyText?: string;
  /** Offer the flat/grouped view toggle + category manager (grouped by default). */
  groupable?: boolean;
  /** Controlled (staged) category structure — required for the grouped view. */
  categories?: SidebarCategory[];
  onCategoriesChange?: (next: SidebarCategory[]) => void;
  /** Controlled (staged) hidden-label set for the grouped view. */
  hiddenLabels?: ReadonlySet<string>;
  onHiddenLabelsChange?: (next: string[]) => void;
}

interface LabelEditorChipProps {
  label: ClassificationLabel;
  readOnly: boolean;
  onRemove: (id: string) => void;
  onSetIcon: (id: string, icon: string) => void;
}

/** Flat-view chip: icon picker + remove (delete from the vocabulary). */
const LabelEditorChip = memo(function LabelEditorChip({
  label,
  readOnly,
  onRemove,
  onSetIcon,
}: LabelEditorChipProps) {
  const { t } = useTranslation();
  return (
    <LabelChip
      label={label.name}
      leading={
        <LabelIconPicker
          value={label.icon}
          onChange={(icon) => onSetIcon(label.id, icon)}
          ariaLabel={t(
            "policies.labels.iconAria",
            "Choose an icon for {{name}}",
            {
              name: label.name,
            },
          )}
        />
      }
      onRemove={readOnly ? undefined : () => onRemove(label.id)}
      removeAriaLabel={t("policies.labels.removeAria", "Remove {{name}}", {
        name: label.name,
      })}
    />
  );
});

export function LabelsEditor({
  value,
  onChange,
  readOnly = false,
  reservedNames,
  addPlaceholder,
  emptyText,
  groupable = false,
  categories = [],
  onCategoriesChange,
  hiddenLabels,
  onHiddenLabelsChange,
}: LabelsEditorProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [view, setView] = useState<"grouped" | "flat">("grouped");
  const grouped = groupable && view === "grouped";

  const add = () => {
    const name = pending.trim();
    if (!name) return;
    if (name.length > MAX_TEXT_LENGTH) {
      setAddError(
        t(
          "policies.labels.tooLong",
          "Labels can be at most {{max}} characters.",
          { max: MAX_TEXT_LENGTH },
        ),
      );
      return;
    }
    const key = name.toLowerCase();
    const taken =
      value.some((label) => label.name.toLowerCase() === key) ||
      (reservedNames ?? []).some((reserved) => reserved.toLowerCase() === key);
    if (taken) {
      setAddError(
        t("policies.labels.duplicate", '"{{name}}" already exists.', { name }),
      );
      return;
    }
    setAddError(null);
    setPending("");
    onChange([...value, { id: labelId(name), name }]);
  };

  const removeById = useCallback(
    (id: string) => onChange(value.filter((label) => label.id !== id)),
    [onChange, value],
  );
  const setIconById = useCallback(
    (id: string, icon: string) =>
      onChange(
        value.map((label) => (label.id === id ? { ...label, icon } : label)),
      ),
    [onChange, value],
  );

  return (
    <div className="labels-editor">
      {!readOnly && (
        <div className="labels-add">
          <input
            className="labels-add-input"
            value={pending}
            maxLength={MAX_TEXT_LENGTH + 1}
            placeholder={
              addPlaceholder ??
              t("policies.labels.addPlaceholder", "Add a label…")
            }
            onChange={(e) => {
              setPending(e.target.value);
              if (addError) setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            leftSection={<AddIcon sx={{ fontSize: "1rem" }} />}
            onClick={add}
            disabled={!pending.trim()}
          >
            {t("policies.labels.add", "Add")}
          </Button>
          {groupable && (
            <div className="labels-view-toggle">
              <Select
                inputSize="sm"
                value={view}
                onChange={(v) =>
                  setView((v as "grouped" | "flat") ?? "grouped")
                }
                options={[
                  {
                    value: "grouped",
                    label: t("policies.labels.viewGrouped", "Grouped"),
                  },
                  {
                    value: "flat",
                    label: t("policies.labels.viewFlat", "Flat"),
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}
      {addError && <p className="labels-add-error">{addError}</p>}

      {value.length === 0 ? (
        <p className="labels-empty">
          {emptyText ?? t("policies.labels.empty", "No labels yet.")}
        </p>
      ) : grouped && onCategoriesChange ? (
        <ClassificationCategoryManager
          labels={value}
          categories={categories}
          onCategoriesChange={onCategoriesChange}
          onLabelsChange={onChange}
          hiddenLabels={hiddenLabels}
          onHiddenLabelsChange={onHiddenLabelsChange}
          readOnly={readOnly}
          searchable
        />
      ) : (
        <div className="labels-chips" role="list">
          {value.map((label) => (
            <LabelEditorChip
              key={label.id}
              label={label}
              readOnly={readOnly}
              onRemove={removeById}
              onSetIcon={setIconById}
            />
          ))}
        </div>
      )}
    </div>
  );
}
