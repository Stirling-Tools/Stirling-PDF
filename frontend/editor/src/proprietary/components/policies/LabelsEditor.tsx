// Editor for a classification-label list: an add box on top, then the labels as chips (icon picker + remove), duplicate names rejected case-insensitively (optionally also against `reservedNames`). In `grouped` mode the chips are organised under collapsible parent categories (the device-local sidebar categories), matching the sidebar's category picker; labels in no category fall under "Ungrouped". Grouping is presentational — editing still mutates the flat list.

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Button } from "@app/ui/Button";
import { LabelChip } from "@app/ui/LabelChip";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import {
  getSidebarCategories,
  subscribeSidebarCategories,
} from "@app/services/fileSidebarCategories";
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
  /** Render chips under collapsible parent categories (like the sidebar picker). */
  grouped?: boolean;
}

export function LabelsEditor({
  value,
  onChange,
  readOnly = false,
  reservedNames,
  addPlaceholder,
  emptyText,
  grouped = false,
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

  const removeById = (id: string) =>
    onChange(value.filter((label) => label.id !== id));

  const setIconById = (id: string, icon: string) =>
    onChange(
      value.map((label) => (label.id === id ? { ...label, icon } : label)),
    );

  const renderChip = (label: ClassificationLabel) => {
    const key = label.id;
    return (
      <LabelChip
        key={key}
        label={label.name}
        leading={
          readOnly ? (
            <span className="sui-labelchip-icon">
              <LocalIcon icon={label.icon || DEFAULT_LABEL_ICON} width="1rem" />
            </span>
          ) : (
            <LabelIconPicker
              value={label.icon}
              onChange={(icon) => setIconById(key, icon)}
              ariaLabel={t(
                "policies.labels.iconAria",
                "Choose an icon for {{name}}",
                { name: label.name },
              )}
            />
          )
        }
        onRemove={readOnly ? undefined : () => removeById(key)}
        removeAriaLabel={t("policies.labels.removeAria", "Remove {{name}}", {
          name: label.name,
        })}
      />
    );
  };

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
        </div>
      )}
      {addError && <p className="labels-add-error">{addError}</p>}

      {value.length === 0 ? (
        <p className="labels-empty">
          {emptyText ?? t("policies.labels.empty", "No labels yet.")}
        </p>
      ) : grouped ? (
        <GroupedLabels value={value} renderChip={renderChip} />
      ) : (
        <div className="labels-chips" role="list">
          {value.map(renderChip)}
        </div>
      )}
    </div>
  );
}

interface GroupedLabelsProps {
  value: ClassificationLabel[];
  renderChip: (label: ClassificationLabel) => ReactNode;
}

/** Chips laid out under collapsible parent categories (device-local structure). */
function GroupedLabels({ value, renderChip }: GroupedLabelsProps) {
  const { t } = useTranslation();
  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );

  // Category sections that actually contain labels from `value`, plus the leftovers.
  const { sections, ungrouped } = useMemo(() => {
    const byId = new Map(value.map((l) => [l.id, l]));
    const claimed = new Set<string>();
    const sections = categories
      .map((category) => {
        const members = category.labelKeys
          .map((id) => byId.get(id))
          .filter((l): l is ClassificationLabel => !!l);
        members.forEach((m) => claimed.add(m.id));
        return { category, members };
      })
      .filter((s) => s.members.length > 0);
    const ungrouped = value.filter((l) => !claimed.has(l.id));
    return { sections, ungrouped };
  }, [value, categories]);

  // Only the first section starts expanded — a scannable overview.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(sections.length > 0 ? [sections[0].category.id] : []),
  );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="labels-groups">
      {sections.map(({ category, members }) => {
        const isOpen = expanded.has(category.id);
        return (
          <section key={category.id} className="labels-group">
            <Button
              variant="quiet"
              fullWidth
              justify="between"
              className="labels-group-header"
              aria-expanded={isOpen}
              onClick={() => toggle(category.id)}
              leftSection={
                <>
                  {isOpen ? (
                    <KeyboardArrowDownIcon sx={{ fontSize: "1.1rem" }} />
                  ) : (
                    <KeyboardArrowRightIcon sx={{ fontSize: "1.1rem" }} />
                  )}
                  <LocalIcon icon={category.icon} width="1.05rem" />
                </>
              }
              rightSection={
                <span className="labels-group-count">{members.length}</span>
              }
            >
              <span className="labels-group-name">{category.name}</span>
            </Button>
            {isOpen && (
              <div className="labels-chips" role="list">
                {members.map(renderChip)}
              </div>
            )}
          </section>
        );
      })}
      {ungrouped.length > 0 && (
        <section className="labels-group">
          <p className="labels-group-ungrouped">
            {t("policies.labels.ungrouped", "Ungrouped")}
          </p>
          <div className="labels-chips" role="list">
            {ungrouped.map(renderChip)}
          </div>
        </section>
      )}
    </div>
  );
}
