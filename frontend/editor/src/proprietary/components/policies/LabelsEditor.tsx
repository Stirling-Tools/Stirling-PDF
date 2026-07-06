/**
 * Flat editor for a classification-label list: an add box on top, then the
 * labels as a wrapping grid of chips — each with an icon picker and a remove
 * button. Fully controlled (the caller owns the list); duplicate names are
 * rejected case-insensitively, optionally also against `reservedNames`
 * (e.g. the team set, when editing personal labels).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import { Button } from "@shared/components/Button";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import type { ClassificationLabel } from "@app/data/classificationLabels";

const MAX_TEXT_LENGTH = 128;

interface LabelsEditorProps {
  value: ClassificationLabel[];
  onChange: (next: ClassificationLabel[]) => void;
  readOnly?: boolean;
  /** Names that can't be added here because another set already owns them. */
  reservedNames?: string[];
  addPlaceholder?: string;
  emptyText?: string;
}

export function LabelsEditor({
  value,
  onChange,
  readOnly = false,
  reservedNames,
  addPlaceholder,
  emptyText,
}: LabelsEditorProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const add = () => {
    const name = pending.trim();
    if (!name) return;
    if (name.length > MAX_TEXT_LENGTH) {
      setAddError(
        t(
          "policies.labels.tooLong",
          "Labels can be at most {{max}} characters.",
          {
            max: MAX_TEXT_LENGTH,
          },
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
    onChange([...value, { name }]);
  };

  const removeAt = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  const setIconAt = (index: number, icon: string) =>
    onChange(
      value.map((label, i) => (i === index ? { ...label, icon } : label)),
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
            variant="outline"
            size="sm"
            leadingIcon={<AddIcon sx={{ fontSize: "1rem" }} />}
            onClick={add}
            disabled={!pending.trim()}
          >
            {t("policies.labels.add", "Add")}
          </Button>
        </div>
      )}
      {addError && <p className="labels-add-error">{addError}</p>}

      {value.length === 0 ? (
        <p className="labels-empty">
          {emptyText ?? t("policies.labels.empty", "No labels yet.")}
        </p>
      ) : (
        <div className="labels-chips" role="list">
          {value.map((label, index) => (
            <span className="labels-chip" role="listitem" key={label.name}>
              {readOnly ? (
                <span className="labels-chip-icon">
                  <LocalIcon
                    icon={label.icon || DEFAULT_LABEL_ICON}
                    width="1rem"
                  />
                </span>
              ) : (
                <LabelIconPicker
                  value={label.icon}
                  onChange={(icon) => setIconAt(index, icon)}
                  ariaLabel={t(
                    "policies.labels.iconAria",
                    "Choose an icon for {{name}}",
                    { name: label.name },
                  )}
                />
              )}
              <span className="labels-chip-name" title={label.name}>
                {label.name}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="labels-chip-remove"
                  onClick={() => removeAt(index)}
                  aria-label={t(
                    "policies.labels.removeAria",
                    "Remove {{name}}",
                    {
                      name: label.name,
                    },
                  )}
                >
                  <CloseIcon sx={{ fontSize: "0.85rem" }} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
