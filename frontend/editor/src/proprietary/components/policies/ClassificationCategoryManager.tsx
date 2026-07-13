// Shared, controlled category manager for classification labels — used by both
// the editor's Files-sidebar category picker and the processor's labels editor,
// so the two never drift.
//
// It groups the label vocabulary under the (device-local, personal) sidebar
// categories: collapsible categories with their member chips, create / rename /
// icon / delete-grouping, add-label, and an optional per-category "Select all".
// Labels in no category surface under a "Custom" group, pinned to the top.
//
// Controlled: `categories` + `onCategoriesChange` are owned by the caller, which
// decides whether an edit applies live (editor) or is staged until save
// (processor). Label-vocabulary editing (create / delete team labels, icon
// pickers, delete-category-also-deletes-its-labels) only appears when
// `onLabelsChange` is supplied — i.e. in the processor.

import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import { LabelChip } from "@app/ui/LabelChip";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
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
const CUSTOM_GROUP_ID = "__custom__";

export interface ClassificationCategoryManagerProps {
  /** The label vocabulary (chip display + membership resolution). */
  labels: ClassificationLabel[];
  /** Controlled category structure. */
  categories: SidebarCategory[];
  onCategoriesChange: (next: SidebarCategory[]) => void;
  readOnly?: boolean;
  /**
   * Supply to edit the team vocabulary (create / delete labels, icon pickers).
   * Absent → grouping-only (the editor sidebar picker): labels are read-only and
   * a category's chips can only be added/removed from the grouping.
   */
  onLabelsChange?: (next: ClassificationLabel[]) => void;
  /** Select mode (processor bulk actions live in the parent toolbar). */
  selectMode?: boolean;
  selected?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  onSelectIds?: (ids: string[], select: boolean) => void;
  /** Per-label file counts (editor sidebar). */
  labelCounts?: Map<string, number>;
  /** Per-category header counts (editor: files in category). Defaults to the
   *  number of member labels present in the vocabulary. */
  categoryCounts?: Map<string, number>;
  /** Offer a per-category hide toggle (editor sidebar groups). */
  canHide?: boolean;
  /** Show a search box that filters categories + labels. */
  searchable?: boolean;
  /** Resolve a label's display name (editor translates via classification.labels.<id>). */
  labelDisplay?: (label: ClassificationLabel) => string;
}

export function ClassificationCategoryManager({
  labels,
  categories,
  onCategoriesChange,
  readOnly = false,
  onLabelsChange,
  selectMode = false,
  selected,
  onToggleSelect,
  onSelectIds,
  labelCounts,
  categoryCounts,
  canHide = false,
  searchable = false,
  labelDisplay,
}: ClassificationCategoryManagerProps) {
  const { t } = useTranslation();
  const canEditLabels = !!onLabelsChange;

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () =>
      new Set([CUSTOM_GROUP_ID, categories[0]?.id].filter(Boolean) as string[]),
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [addDraft, setAddDraft] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SidebarCategory | null>(
    null,
  );

  const display = (label: ClassificationLabel) =>
    labelDisplay?.(label) ?? label.name;
  const idByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of labels) {
      map.set(l.name.toLowerCase(), l.id);
      map.set((labelDisplay?.(l) ?? l.name).toLowerCase(), l.id);
    }
    return map;
  }, [labels, labelDisplay]);

  // Member labels per category (present in the vocabulary), and the leftovers.
  const { sections, custom } = useMemo(() => {
    const byId = new Map(labels.map((l) => [l.id, l]));
    const claimed = new Set<string>();
    const sections = categories.map((category) => {
      const members = category.labelKeys
        .map((id) => byId.get(id))
        .filter((l): l is ClassificationLabel => !!l);
      members.forEach((m) => claimed.add(m.id));
      return { category, members };
    });
    const custom = labels.filter((l) => !claimed.has(l.id));
    return { sections, custom };
  }, [labels, categories]);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => q === "" || text.toLowerCase().includes(q);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- category transforms (pure over the controlled array) ----
  const patchCategory = (id: string, patch: Partial<SidebarCategory>) =>
    onCategoriesChange(
      categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  const removeCategory = (id: string) =>
    onCategoriesChange(categories.filter((c) => c.id !== id));
  const removeLabelFromCategory = (categoryId: string, lid: string) =>
    onCategoriesChange(
      categories.map((c) =>
        c.id === categoryId
          ? { ...c, labelKeys: c.labelKeys.filter((k) => k !== lid) }
          : c,
      ),
    );

  const commitRename = (id: string) => {
    const name = renameDraft.trim();
    if (name) patchCategory(id, { name });
    setRenaming(null);
  };

  // Add an existing (by name) or brand-new label to a category. New labels are
  // only created when the vocabulary is editable (processor).
  const submitAddLabel = (categoryId: string) => {
    const name = (addDraft[categoryId] ?? "").trim();
    if (!name || name.length > MAX_TEXT_LENGTH) return;
    let lid = idByName.get(name.toLowerCase());
    if (!lid) {
      if (!canEditLabels) return; // grouping-only: unknown label is ignored
      lid = labelId(name);
      onLabelsChange?.([...labels, { id: lid, name }]);
    }
    onCategoriesChange(
      categories.map((c) =>
        c.id === categoryId && !c.labelKeys.includes(lid as string)
          ? { ...c, labelKeys: [...c.labelKeys, lid as string] }
          : c,
      ),
    );
    setAddDraft((prev) => ({ ...prev, [categoryId]: "" }));
  };

  const createCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    const id = makeCustomCategoryId(name, categories);
    onCategoriesChange([
      ...categories,
      { id, name, icon: NEW_CATEGORY_ICON, labelKeys: [] },
    ]);
    setExpanded((prev) => new Set(prev).add(id));
    setNewCategory("");
  };

  // Delete a category. In the processor this also removes its member labels from
  // the vocabulary (confirmed first); grouping-only just drops the grouping.
  const requestDeleteCategory = (category: SidebarCategory) => {
    if (canEditLabels) {
      setConfirmDelete(category);
      return;
    }
    removeCategory(category.id);
  };
  const confirmDeleteCategory = () => {
    const category = confirmDelete;
    if (!category) return;
    const memberIds = new Set(category.labelKeys);
    removeCategory(category.id);
    onLabelsChange?.(labels.filter((l) => !memberIds.has(l.id)));
    setConfirmDelete(null);
  };

  const renderChip = (
    label: ClassificationLabel,
    categoryId: string | null,
  ) => {
    const name = display(label);
    const leading =
      canEditLabels && !readOnly && !selectMode ? (
        <LabelIconPicker
          value={label.icon}
          onChange={(icon) =>
            onLabelsChange?.(
              labels.map((l) => (l.id === label.id ? { ...l, icon } : l)),
            )
          }
          ariaLabel={t(
            "policies.labels.iconAria",
            "Choose an icon for {{name}}",
            {
              name,
            },
          )}
        />
      ) : (
        <span className="sui-labelchip-icon">
          <LocalIcon icon={label.icon || DEFAULT_LABEL_ICON} width="1rem" />
        </span>
      );
    if (selectMode) {
      return (
        <LabelChip
          key={label.id}
          label={name}
          leading={leading}
          count={labelCounts?.get(label.id)}
          selected={selected?.has(label.id) ?? false}
          onSelectToggle={() => onToggleSelect?.(label.id)}
          selectAriaLabel={t("policies.labels.selectAria", "Select {{name}}", {
            name,
          })}
        />
      );
    }
    // × removes from the category (ungroup); a Custom-group chip has no category
    // to leave, so there it deletes the label (only when the vocabulary is
    // editable — the editor picker can't delete team labels).
    const onRemove = readOnly
      ? undefined
      : categoryId
        ? () => removeLabelFromCategory(categoryId, label.id)
        : canEditLabels
          ? () => onLabelsChange?.(labels.filter((l) => l.id !== label.id))
          : undefined;
    return (
      <LabelChip
        key={label.id}
        label={name}
        leading={leading}
        count={labelCounts?.get(label.id)}
        onRemove={onRemove}
        removeAriaLabel={
          categoryId
            ? t("policies.labels.removeFromCategory", "Remove {{name}}", {
                name,
              })
            : t("policies.labels.removeAria", "Remove {{name}}", { name })
        }
      />
    );
  };

  const renderGroup = (opts: {
    id: string;
    name: string;
    icon: ReactNode;
    members: ClassificationLabel[];
    category?: SidebarCategory;
  }) => {
    const { id, name, icon, members, category } = opts;
    const memberChips = members.filter((m) => matches(display(m)));
    // Hide a group entirely when a search matches neither its name nor any member.
    if (q !== "" && !matches(name) && memberChips.length === 0) return null;
    const isOpen = q !== "" || expanded.has(id);
    const memberIds = members.map((m) => m.id);
    const allSelected =
      memberIds.length > 0 && memberIds.every((mid) => selected?.has(mid));
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
          <span className="labels-group-count">
            {categoryCounts?.get(id) ?? members.length}
          </span>
          {selectMode && memberIds.length > 0 && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => onSelectIds?.(memberIds, !allSelected)}
            >
              {allSelected
                ? t("policies.labels.selectNone", "Clear")
                : t("policies.labels.selectAll", "Select all")}
            </Button>
          )}
          {!readOnly && category && canHide && (
            <Button
              variant="quiet"
              size="sm"
              aria-label={
                category.hidden
                  ? t("policies.labels.showCategory", "Show category")
                  : t("policies.labels.hideCategory", "Hide category")
              }
              aria-pressed={!category.hidden}
              onClick={() =>
                patchCategory(category.id, { hidden: !category.hidden })
              }
            >
              {category.hidden ? (
                <VisibilityOffIcon sx={{ fontSize: "1rem" }} />
              ) : (
                <VisibilityIcon sx={{ fontSize: "1rem" }} />
              )}
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
              onClick={() => requestDeleteCategory(category)}
            >
              <DeleteOutlineIcon sx={{ fontSize: "1rem" }} />
            </Button>
          )}
        </div>
        {isOpen && (
          <div className="labels-group-body">
            {memberChips.length > 0 ? (
              <div className="labels-chips" role="list">
                {memberChips.map((label) =>
                  renderChip(label, category ? id : null),
                )}
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
                  list={`cat-vocab-${id}`}
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
                      submitAddLabel(id);
                    }
                  }}
                />
                <datalist id={`cat-vocab-${id}`}>
                  {labels
                    .filter((l) => !(category.labelKeys ?? []).includes(l.id))
                    .map((l) => (
                      <option key={l.id} value={display(l)} />
                    ))}
                </datalist>
                <Button
                  variant="secondary"
                  size="sm"
                  leftSection={<AddIcon sx={{ fontSize: "1rem" }} />}
                  onClick={() => submitAddLabel(id)}
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
      {searchable && (
        <input
          className="labels-add-input labels-search"
          value={query}
          placeholder={t("policies.labels.search", "Search labels…")}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

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
              onChange={(icon) => patchCategory(category.id, { icon })}
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

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        width="sm"
        title={t("policies.labels.deleteCategoryTitle", "Delete category?")}
        footer={
          <div className="labels-footer-right">
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setConfirmDelete(null)}
            >
              {t("cancel", "Cancel")}
            </Button>
            <Button
              variant="primary"
              accent="danger"
              size="sm"
              onClick={confirmDeleteCategory}
            >
              {t("policies.labels.deleteCategoryConfirm", "Delete category")}
            </Button>
          </div>
        }
      >
        <p>
          {t(
            "policies.labels.deleteCategoryBody",
            'Deleting "{{name}}" also deletes its {{count}} label(s) from your team’s vocabulary. Categories are your own personal grouping, but labels are shared with your whole team. Nothing is saved until you choose Save for team.',
            {
              name: confirmDelete?.name ?? "",
              count: confirmDelete?.labelKeys.length ?? 0,
            },
          )}
        </p>
      </Modal>
    </div>
  );
}
