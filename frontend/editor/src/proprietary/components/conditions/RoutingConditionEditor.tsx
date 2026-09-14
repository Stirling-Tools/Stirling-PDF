import { useTranslation } from "react-i18next";
import { Input, Select } from "@app/ui";
import { ClassificationConditionEditor } from "@app/components/conditions/ClassificationConditionEditor";
import {
  classificationCondition,
  documentFieldCondition,
  requiresClassification,
} from "@app/data/classificationConditions";
import type { MatchesAnyCondition } from "@app/conditions/types";

interface RoutingConditionEditorProps {
  condition: MatchesAnyCondition;
  onChange: (condition: MatchesAnyCondition) => void;
  classificationAvailable: boolean;
}

const DOCUMENT_FIELDS = [
  "classification.labels",
  "document.extension",
  "document.filename",
  "document.title",
  "document.author",
] as const;

/** Edits either an AI classification match or a deterministic document-fact match. */
export function RoutingConditionEditor({
  condition,
  onChange,
  classificationAvailable,
}: RoutingConditionEditorProps) {
  const { t } = useTranslation();
  const field = condition.input.field;
  const classification = requiresClassification(condition);
  const options = [
    {
      value: DOCUMENT_FIELDS[0],
      label: classificationAvailable
        ? t(
            "portal.pipelines.builder.routing.matchDocumentType",
            "Document type (AI classification)",
          )
        : t(
            "portal.pipelines.builder.routing.matchDocumentTypeDisabled",
            "Document type (AI unavailable)",
          ),
      disabled: !classificationAvailable,
    },
    {
      value: DOCUMENT_FIELDS[1],
      label: t(
        "portal.pipelines.builder.routing.matchExtension",
        "File extension (no AI)",
      ),
    },
    {
      value: DOCUMENT_FIELDS[2],
      label: t(
        "portal.pipelines.builder.routing.matchFilename",
        "Exact filename (no AI)",
      ),
    },
    {
      value: DOCUMENT_FIELDS[3],
      label: t(
        "portal.pipelines.builder.routing.matchTitle",
        "PDF title (no AI)",
      ),
    },
    {
      value: DOCUMENT_FIELDS[4],
      label: t(
        "portal.pipelines.builder.routing.matchAuthor",
        "PDF author (no AI)",
      ),
    },
  ];

  function changeField(next: string | null) {
    if (!next) return;
    onChange(
      next === "classification.labels"
        ? classificationCondition()
        : documentFieldCondition(next),
    );
  }

  return (
    <div className="portal-routing__condition">
      <Select
        inputSize="sm"
        aria-label={t("portal.pipelines.builder.routing.matchBy", "Match by")}
        value={field}
        onChange={changeField}
        options={options}
        comboboxProps={{ withinPortal: true }}
      />
      {classification ? (
        <ClassificationConditionEditor
          condition={condition}
          onChange={onChange}
          disabled={!classificationAvailable}
        />
      ) : (
        <Input
          inputSize="sm"
          aria-label={t(
            "portal.pipelines.builder.routing.matchValues",
            "Values to match",
          )}
          placeholder={
            field === "document.extension"
              ? t(
                  "portal.pipelines.builder.routing.extensionPlaceholder",
                  "pdf, docx, png",
                )
              : t(
                  "portal.pipelines.builder.routing.valuePlaceholder",
                  "Enter exact values, separated by commas",
                )
          }
          value={condition.values.join(", ")}
          invalid={condition.values.every((value) => value.trim() === "")}
          onChange={(event) =>
            onChange({
              ...condition,
              values: event.target.value
                .split(",")
                .map((value) => value.trim()),
            })
          }
        />
      )}
    </div>
  );
}
