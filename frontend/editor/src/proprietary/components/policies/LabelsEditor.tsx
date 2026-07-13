// Editor for a classification-label list. Two views (toggle, grouped by default):
// - Grouped: labels laid out under the device-local sidebar categories, with
//   per-category create / rename / icon / delete-grouping and add-label, so it's
//   easy to see what's where. Labels in no category fall under a "Custom" group,
//   pinned to the top whenever it has any. Categories are presentational only
//   (the classifier never sees them) and their membership persists even when a
//   label is deleted, so a re-created label returns to its original group.
// - Flat: the plain chip grid.
// Both views share the add box, the icon pickers, and Select mode — where you
// tick labels (a whole category at once) and bulk-delete them from the vocabulary.

import {
  memo,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import ChecklistIcon from "@mui/icons-material/Checklist";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Button } from "@app/ui/Button";
import { LabelChip } from "@app/ui/LabelChip";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import {
  addCategory,
  addLabelToCategory,
  deleteCategory,
  getSidebarCategories,
  renameCategory,
  setCategoryIcon,
  subscribeSidebarCategories,
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
}

interface LabelEditorChipProps {
  label: ClassificationLabel;
  readOnly: boolean;
  selectMode: boolean;
  selected: boolean;
  onRemove: (id: string) => void;
  onSetIcon: (id: string, icon: string) => void;
  onToggleSelect: (id: string) => void;
  removeAriaLabel?: string;
}

const LabelEditorChip = memo(function LabelEditorChip({
  label,
  readOnly,
  selectMode,
  selected,
  onRemove,
  onSetIcon,
  onToggleSelect,
  removeAriaLabel,
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
            removeAriaLabel:
              removeAriaLabel ??
              t("policies.labels.removeAria", "Remove {{name}}", {
                name: label.name,
              }),
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

  const nameTaken = (name: string) => {
    const key = name.toLowerCase();
    return (
      value.some((label) => label.name.toLowerCase() === key) ||
      (reservedNames ?? []).some((reserved) => reserved.toLowerCase() === key)
    );
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
    if (nameTaken(name)) {
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

  /**
   * Add an existing (by name) or brand-new label to a category. Creating the
   * label writes it to the vocabulary; grouping it is device-local. A duplicate
   * new name is ignored (the label already exists elsewhere).
   */
  const addLabelNamed = useCallback(
    (categoryId: string, rawName: string) => {
      const name = rawName.trim();
      if (!name || name.length > MAX_TEXT_LENGTH) return;
      const existing = value.find(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      );
      const id = existing?.id ?? labelId(name);
      if (!existing) onChange([...value, { id, name }]);
      addLabelToCategory(categoryId, id);
    },
    [onChange, value],
  );

  const renderChip = (label: ClassificationLabel, removeAriaLabel?: string) => (
    <LabelEditorChip
      key={label.id}
      label={label}
      readOnly={readOnly}
      selectMode={selectMode}
      selected={selected.has(label.id)}
      onRemove={removeById}
      onSetIcon={setIconById}
      onToggleSelect={toggleSelected}
      removeAriaLabel={removeAriaLabel}
    />
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
            <div className="labels-view-toggle" role="group">
              <Button
                variant={view === "grouped" ? "secondary" : "quiet"}
                size="sm"
                aria-pressed={view === "grouped"}
                onClick={() => setView("grouped")}
              >
                {t("policies.labels.viewGrouped", "Grouped")}
              </Button>
              <Button
                variant={view === "flat" ? "secondary" : "quiet"}
                size="sm"
                aria-pressed={view === "flat"}
                onClick={() => setView("flat")}
              >
                {t("policies.labels.viewFlat", "Flat")}
              </Button>
            </div>
          )}
        </div>
      )}
      {addError && <p className="labels-add-error">{addError}</p>}

      {value.length === 0 ? (
        <p className="labels-empty">
          {emptyText ?? t("policies.labels.empty", "No labels yet.")}
        </p>
      ) : grouped ? (
        <CategoryManager
          value={value}
          renderChip={renderChip}
          readOnly={readOnly}
          selectMode={selectMode}
          selected={selected}
          onSelectIds={selectIds}
          onSetCategoryIcon={setCategoryIcon}
          onRenameCategory={renameCategory}
          onDeleteCategory={deleteCategory}
          onAddLabel={addLabelNamed}
          onCreateCategory={(name) => addCategory(name, NEW_CATEGORY_ICON)}
        />
      ) : (
        <div className="labels-chips" role="list">
          {value.map((label) => renderChip(label))}
        </div>
      )}
    </div>
  );
}

interface CategoryManagerProps {
  value: ClassificationLabel[];
  renderChip: (
    label: ClassificationLabel,
    removeAriaLabel?: string,
  ) => ReactNode;
  readOnly: boolean;
  selectMode: boolean;
  selected: ReadonlySet<string>;
  onSelectIds: (ids: string[], select: boolean) => void;
  onSetCategoryIcon: (id: string, icon: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onAddLabel: (categoryId: string, name: string) => void;
  onCreateCategory: (name: string) => string;
}

const CUSTOM_GROUP_ID = "__custom__";

/**
 * Grouped view: every device-local category (collapsible) with its member label
 * chips, plus a virtual "Custom" group for labels in no category — pinned to the
 * top when it has any. Category edits are device-local; label edits (add/delete)
 * flow back to the shared vocabulary via the parent.
 */
function CategoryManager({
  value,
  renderChip,
  readOnly,
  selectMode,
  selected,
  onSelectIds,
  onSetCategoryIcon,
  onRenameCategory,
  onDeleteCategory,
  onAddLabel,
  onCreateCategory,
}: CategoryManagerProps) {
  const { t } = useTranslation();
  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );

  // Resolve each category's member labels (those present in the vocabulary) and
  // the leftovers that belong to no category — the "Custom" group.
  const { sections, custom } = useMemo(() => {
    const byId = new Map(value.map((l) => [l.id, l]));
    const claimed = new Set<string>();
    const sections = categories.map((category) => {
      const members = category.labelKeys
        .map((id) => byId.get(id))
        .filter((l): l is ClassificationLabel => !!l);
      members.forEach((m) => claimed.add(m.id));
      return { category, members };
    });
    const custom = value.filter((l) => !claimed.has(l.id));
    return { sections, custom };
  }, [value, categories]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () =>
      new Set([CUSTOM_GROUP_ID, categories[0]?.id].filter(Boolean) as string[]),
  );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [addDraft, setAddDraft] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");

  const commitRename = (id: string) => {
    const name = renameDraft.trim();
    if (name) onRenameCategory(id, name);
    setRenaming(null);
  };

  const submitAdd = (categoryId: string) => {
    const name = (addDraft[categoryId] ?? "").trim();
    if (!name) return;
    onAddLabel(categoryId, name);
    setAddDraft((prev) => ({ ...prev, [categoryId]: "" }));
  };

  const createCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    const id = onCreateCategory(name);
    setExpanded((prev) => new Set(prev).add(id));
    setNewCategory("");
  };

  const renderGroup = (opts: {
    id: string;
    name: string;
    icon: ReactNode;
    members: ClassificationLabel[];
    category?: SidebarCategory;
  }) => {
    const { id, name, icon, members, category } = opts;
    const isOpen = expanded.has(id);
    const memberIds = members.map((m) => m.id);
    const allSelected =
      memberIds.length > 0 && memberIds.every((mid) => selected.has(mid));
    return (
      <section key={id} className="labels-group">
        <div className="labels-group-header">
          <Button
            variant="quiet"
            size="sm"
            className="labels-group-toggle"
            aria-expanded={isOpen}
            aria-label={name}
            onClick={() => toggle(id)}
          >
            {isOpen ? (
              <KeyboardArrowDownIcon sx={{ fontSize: "1.1rem" }} />
            ) : (
              <KeyboardArrowRightIcon sx={{ fontSize: "1.1rem" }} />
            )}
          </Button>
          <span className="labels-group-icon">{icon}</span>
          {renaming === id ? (
            <input
              className="labels-add-input labels-group-rename"
              value={renameDraft}
              autoFocus
              maxLength={MAX_TEXT_LENGTH}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(id);
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <Button
              variant="quiet"
              size="sm"
              justify="start"
              className="labels-group-name"
              onClick={() => {
                if (!category || readOnly) {
                  toggle(id);
                  return;
                }
                setRenaming(id);
                setRenameDraft(name);
              }}
            >
              {name}
            </Button>
          )}
          <span className="labels-group-count">{members.length}</span>
          {selectMode && memberIds.length > 0 && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => onSelectIds(memberIds, !allSelected)}
            >
              {allSelected
                ? t("policies.labels.selectNone", "Clear")
                : t("policies.labels.selectAll", "Select all")}
            </Button>
          )}
          {!readOnly && category && (
            <Button
              variant="quiet"
              size="sm"
              accent="danger"
              className="labels-group-delete"
              aria-label={t(
                "policies.labels.deleteCategory",
                "Delete {{name}} category",
                { name },
              )}
              onClick={() => onDeleteCategory(id)}
            >
              <DeleteOutlineIcon sx={{ fontSize: "1rem" }} />
            </Button>
          )}
        </div>
        {isOpen && (
          <div className="labels-group-body">
            {members.length > 0 ? (
              <div className="labels-chips" role="list">
                {members.map((label) => renderChip(label))}
              </div>
            ) : (
              <p className="labels-empty">
                {t(
                  "policies.labels.categoryEmpty",
                  "No labels in this category.",
                )}
              </p>
            )}
            {!readOnly && category && (
              <div className="labels-add labels-group-add">
                <input
                  className="labels-add-input"
                  value={addDraft[id] ?? ""}
                  placeholder={t(
                    "policies.labels.addToCategory",
                    "Add a label to {{name}}…",
                    { name },
                  )}
                  maxLength={MAX_TEXT_LENGTH + 1}
                  onChange={(e) =>
                    setAddDraft((prev) => ({ ...prev, [id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitAdd(id);
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  leftSection={<AddIcon sx={{ fontSize: "1rem" }} />}
                  onClick={() => submitAdd(id)}
                  disabled={!(addDraft[id] ?? "").trim()}
                >
                  {t("policies.labels.add", "Add")}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="labels-groups">
      {custom.length > 0 &&
        renderGroup({
          id: CUSTOM_GROUP_ID,
          name: t("policies.labels.custom", "Custom"),
          icon: <LocalIcon icon="star" width="1.05rem" />,
          members: custom,
        })}

      {sections.map(({ category, members }) =>
        renderGroup({
          id: category.id,
          name: category.name,
          icon: readOnly ? (
            <LocalIcon icon={category.icon} width="1.05rem" />
          ) : (
            <LabelIconPicker
              value={category.icon}
              onChange={(icon) => onSetCategoryIcon(category.id, icon)}
              ariaLabel={t(
                "policies.labels.categoryIconAria",
                "Choose an icon for {{name}}",
                { name: category.name },
              )}
            />
          ),
          members,
          category,
        }),
      )}

      {!readOnly && (
        <div className="labels-add labels-new-category">
          <input
            className="labels-add-input"
            value={newCategory}
            placeholder={t("policies.labels.newCategory", "New category name…")}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createCategory();
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            leftSection={<AddIcon sx={{ fontSize: "1rem" }} />}
            onClick={createCategory}
            disabled={!newCategory.trim()}
          >
            {t("policies.labels.createCategory", "Create category")}
          </Button>
        </div>
      )}
    </div>
  );
}
