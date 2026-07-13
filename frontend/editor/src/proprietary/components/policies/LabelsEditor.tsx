// Editor for a classification-label list. Two views (dropdown, grouped by
// default): a flat chip grid, or the shared {@link ClassificationCategoryManager}
// that lays labels out under their (personal, device-local) sidebar categories.
// Both share the add box and Select mode — tick labels (a whole category at once)
// then bulk-delete them from the vocabulary or add them to a category.
//
// Categories are controlled by the caller (staged until "Save for team" in the
// processor), so nothing here writes them to storage directly.

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "@mantine/core";
import AddIcon from "@mui/icons-material/Add";
import ChecklistIcon from "@mui/icons-material/Checklist";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import { Button } from "@app/ui/Button";
import { Select } from "@app/ui/Select";
import { LabelChip } from "@app/ui/LabelChip";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import { ClassificationCategoryManager } from "@app/components/policies/ClassificationCategoryManager";
import {
  makeCustomCategoryId,
  type SidebarCategory,
} from "@app/services/fileSidebarCategories";
import {
  labelId,
  type ClassificationLabel,
} from "@app/data/classificationLabels";

const MAX_TEXT_LENGTH = 128;
const NEW_CATEGORY_ICON = "folder";

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
}

interface LabelEditorChipProps {
  label: ClassificationLabel;
  readOnly: boolean;
  selectMode: boolean;
  selected: boolean;
  onRemove: (id: string) => void;
  onSetIcon: (id: string, icon: string) => void;
  onToggleSelect: (id: string) => void;
}

const LabelEditorChip = memo(function LabelEditorChip({
  label,
  readOnly,
  selectMode,
  selected,
  onRemove,
  onSetIcon,
  onToggleSelect,
}: LabelEditorChipProps) {
  const { t } = useTranslation();
  const leading =
    readOnly || selectMode ? (
      <span className="sui-labelchip-icon">
        <LocalIcon icon={label.icon || DEFAULT_LABEL_ICON} width="1rem" />
      </span>
    ) : (
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
    );
  return (
    <LabelChip
      label={label.name}
      leading={leading}
      {...(selectMode
        ? {
            selected,
            onSelectToggle: () => onToggleSelect(label.id),
            selectAriaLabel: t(
              "policies.labels.selectAria",
              "Select {{name}}",
              {
                name: label.name,
              },
            ),
          }
        : {
            onRemove: readOnly ? undefined : () => onRemove(label.id),
            removeAriaLabel: t(
              "policies.labels.removeAria",
              "Remove {{name}}",
              {
                name: label.name,
              },
            ),
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
}: LabelsEditorProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [view, setView] = useState<"grouped" | "flat">("grouped");
  const grouped = groupable && view === "grouped";

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectIds = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const enterSelectMode = () => {
    setAddError(null);
    setSelected(new Set());
    setSelectMode(true);
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const deleteSelected = () => {
    onChange(value.filter((label) => !selected.has(label.id)));
    setSelected(new Set());
  };

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

  // Bulk "Add to category" (select mode): fold the selection into an existing or
  // brand-new category.
  const addSelectedToCategory = (categoryId: string) =>
    onCategoriesChange?.(
      categories.map((c) =>
        c.id === categoryId
          ? { ...c, labelKeys: [...new Set([...c.labelKeys, ...selected])] }
          : c,
      ),
    );
  const createCategoryWithSelected = (name: string) =>
    onCategoriesChange?.([
      ...categories,
      {
        id: makeCustomCategoryId(name, categories),
        name,
        icon: NEW_CATEGORY_ICON,
        labelKeys: [...selected],
      },
    ]);

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
          {selectMode ? (
            <>
              <Button
                variant="tertiary"
                accent="danger"
                size="sm"
                leftSection={<DeleteOutlineIcon sx={{ fontSize: "1rem" }} />}
                onClick={deleteSelected}
                disabled={selected.size === 0}
              >
                {selected.size > 0
                  ? t(
                      "policies.labels.deleteSelectedCount",
                      "Delete selected ({{count}})",
                      { count: selected.size },
                    )
                  : t("policies.labels.deleteSelected", "Delete selected")}
              </Button>
              {groupable && onCategoriesChange && (
                <AddToCategoryMenu
                  categories={categories}
                  disabled={selected.size === 0}
                  onAddToCategory={addSelectedToCategory}
                  onCreateAndAdd={createCategoryWithSelected}
                />
              )}
              <Button variant="tertiary" size="sm" onClick={exitSelectMode}>
                {t("policies.labels.done", "Done")}
              </Button>
            </>
          ) : (
            value.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                leftSection={<ChecklistIcon sx={{ fontSize: "1rem" }} />}
                onClick={enterSelectMode}
              >
                {t("policies.labels.select", "Select")}
              </Button>
            )
          )}
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
          readOnly={readOnly}
          selectMode={selectMode}
          selected={selected}
          onToggleSelect={toggleSelected}
          onSelectIds={selectIds}
        />
      ) : (
        <div className="labels-chips" role="list">
          {value.map((label) => (
            <LabelEditorChip
              key={label.id}
              label={label}
              readOnly={readOnly}
              selectMode={selectMode}
              selected={selected.has(label.id)}
              onRemove={removeById}
              onSetIcon={setIconById}
              onToggleSelect={toggleSelected}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface AddToCategoryMenuProps {
  categories: SidebarCategory[];
  disabled: boolean;
  onAddToCategory: (categoryId: string) => void;
  onCreateAndAdd: (name: string) => void;
}

/** Select-mode bulk action: add the ticked labels to a category (alphabetical
 *  list) or a new one. */
function AddToCategoryMenu({
  categories,
  disabled,
  onAddToCategory,
  onCreateAndAdd,
}: AddToCategoryMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    onCreateAndAdd(name);
    setNewName("");
    setOpen(false);
  };

  return (
    <Popover
      opened={open}
      onChange={setOpen}
      position="bottom-start"
      withArrow
      withinPortal
    >
      <Popover.Target>
        <Button
          variant="secondary"
          size="sm"
          leftSection={
            <CreateNewFolderOutlinedIcon sx={{ fontSize: "1rem" }} />
          }
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          {t("policies.labels.addToCategoryAction", "Add to category")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs" className="labels-addcat-dropdown">
        <div className="labels-addcat">
          {sorted.map((c) => (
            <Button
              key={c.id}
              variant="quiet"
              size="sm"
              fullWidth
              justify="start"
              leftSection={<LocalIcon icon={c.icon} width="1rem" />}
              onClick={() => {
                onAddToCategory(c.id);
                setOpen(false);
              }}
            >
              {c.name}
            </Button>
          ))}
          <div className="labels-add labels-addcat-create">
            <input
              className="labels-add-input"
              value={newName}
              maxLength={MAX_TEXT_LENGTH}
              placeholder={t(
                "policies.labels.newCategory",
                "New category name…",
              )}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  create();
                }
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              leftSection={<AddIcon sx={{ fontSize: "1rem" }} />}
              onClick={create}
              disabled={!newName.trim()}
            >
              {t("policies.labels.createCategory", "Create category")}
            </Button>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
