import { useTranslation } from "react-i18next";
import { MultiSelect } from "@app/ui";
import { LABEL_FAMILIES } from "@app/data/classificationLabels";
import type { MatchesAnyCondition } from "@app/conditions/types";

interface ClassificationConditionEditorProps {
  condition: MatchesAnyCondition;
  onChange: (condition: MatchesAnyCondition) => void;
}

/** Edits classification values without owning the destination or action taken on a match. */
export function ClassificationConditionEditor({
  condition,
  onChange,
}: ClassificationConditionEditorProps) {
  const { t } = useTranslation();
  const labelData = LABEL_FAMILIES.map((family) => ({
    group: family.name,
    items: family.labels.map((label) => ({
      value: label.id,
      label: t(`classification.labels.${label.id}`, label.name),
    })),
  }));

  return (
    <MultiSelect
      inputSize="sm"
      aria-label={t(
        "portal.policies.wizard.routing.labelAria",
        "Document types",
      )}
      placeholder={
        condition.values.length === 0
          ? t(
              "portal.policies.wizard.routing.labelPlaceholder",
              "Choose document types",
            )
          : undefined
      }
      data={labelData}
      value={condition.values}
      onChange={(values) => onChange({ ...condition, values })}
      invalid={condition.values.length === 0}
      searchable
      clearable
      maxDropdownHeight={280}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
