// The Files-sidebar category manager: a "tune" button opening a modal where you shape the parent categories your files group under. Each category (collapsible, busiest first) has an editable name + icon, a hide toggle, delete, and its member-label chips; add existing team labels to a category, create new categories, reset to the built-in defaults. All device-local (grouping only — it never changes the team's label vocabulary); files in no visible category fall back to "Other".

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import TuneIcon from "@mui/icons-material/Tune";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AddIcon from "@mui/icons-material/Add";
import { TextInput } from "@mantine/core";
import { Modal } from "@app/ui/Modal";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { LabelChip } from "@app/ui/LabelChip";
import { LabelIconPicker } from "@app/components/policies/LabelIconPicker";
import { useClassificationLabels } from "@app/hooks/useClassificationLabels";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import { bucketStubsByLabel } from "@app/components/shared/fileSidebarGroupingLogic";
import {
  addCategory,
  addLabelToCategory,
  deleteCategory,
  getSidebarCategories,
  removeLabelFromCategory,
  renameCategory,
  resetSidebarCategories,
  setCategoryHidden,
  setCategoryIcon,
  subscribeSidebarCategories,
} from "@app/services/fileSidebarCategories";
import type { StirlingFileStub } from "@app/types/fileContext";
import "@app/components/shared/FileSidebarGroupControls.css";

interface FileSidebarGroupControlsProps {
  /** The files currently listed, for live per-label counts. */
  stubs: StirlingFileStub[];
}

/** New categories start with a neutral folder icon the user can change. */
const NEW_CATEGORY_ICON = "folder";

export function FileSidebarGroupControls({
  stubs,
}: FileSidebarGroupControlsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );
  // Only fetch the team label set while the picker is open.
  const { merged: labelSet } = useClassificationLabels(open);

  // Bucketed once and reused for both the per-label and per-category counts below.
  const byLabel = useMemo(() => bucketStubsByLabel(stubs), [stubs]);

  // Per-label file counts from the same bucketing the sidebar groups use.
  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, bucket] of byLabel) counts.set(key, bucket.stubs.length);
    return counts;
  }, [byLabel]);

  // Files per category (deduped across its labels).
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      const ids = new Set<string>();
      for (const key of category.labelKeys) {
        for (const stub of byLabel.get(key)?.stubs ?? []) {
          ids.add(stub.id as string);
        }
      }
      counts.set(category.id, ids.size);
    }
    return counts;
  }, [byLabel, categories]);

  // Display name + icon per label key, from the effective vocabulary (team ∪ personal).
  const vocab = useMemo(() => {
    const byKey = new Map<string, { display: string; icon?: string }>();
    for (const label of labelSet) {
      byKey.set(label.name.toLowerCase(), {
        display: label.name,
        icon: label.icon,
      });
    }
    return byKey;
  }, [labelSet]);

  const labelDisplay = (key: string) => vocab.get(key)?.display ?? key;
  const labelIcon = (key: string) => vocab.get(key)?.icon ?? DEFAULT_LABEL_ICON;

  const q = query.trim().toLowerCase();
  const matches = (text: string) => q === "" || text.toLowerCase().includes(q);

  // Busiest categories first (ties keep declaration order).
  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) =>
          (categoryCounts.get(b.id) ?? 0) - (categoryCounts.get(a.id) ?? 0),
      ),
    [categories, categoryCounts],
  );

  // Per-category collapse; on open only the busiest starts expanded.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Inline rename + add-label drafts, keyed by category id.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [addDraft, setAddDraft] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");

  const openPicker = () => {
    setQuery("");
    setRenaming(null);
    setNewCategory("");
    setExpanded(
      new Set(sortedCategories.length > 0 ? [sortedCategories[0].id] : []),
    );
    setOpen(true);
  };

  const commitRename = (id: string) => {
    const name = renameDraft.trim();
    if (name) renameCategory(id, name);
    setRenaming(null);
  };

  // Add an existing team label to a category (device-local grouping only — categories don't change
  // the team vocabulary). A name that isn't a known team label is ignored; the input's datalist
  // steers callers to real ones.
  const addLabel = (categoryId: string) => {
    const name = (addDraft[categoryId] ?? "").trim();
    if (!name) return;
    const known = vocab.get(name.toLowerCase());
    if (!known) return;
    addLabelToCategory(categoryId, known.display);
    setAddDraft((prev) => ({ ...prev, [categoryId]: "" }));
  };

  const createCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    const id = addCategory(name, NEW_CATEGORY_ICON);
    setExpanded((prev) => new Set(prev).add(id));
    setNewCategory("");
  };

  return (
    <>
      {/* -external: revealed on section-header hover, like the Browse button. */}
      <ActionIcon
        variant="quiet"
        className="file-sidebar-section-btn file-sidebar-section-btn-external"
        onClick={openPicker}
        aria-label={t("fileSidebar.customizeGroups", "Customize groups")}
        data-testid="customize-groups"
      >
        <TuneIcon sx={{ fontSize: "1rem" }} />
      </ActionIcon>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="xl"
        className="fsg-modal"
        title={t("fileSidebar.groupsModal.title", "Sidebar categories")}
        subtitle={t(
          "fileSidebar.groupsModal.subtitle",
          "Group your files into parent categories. Add existing or new labels to a category, rename it, or create your own. Files in none of your categories appear under “Other”.",
        )}
        footer={
          <div className="fsg-footer">
            <Button
              variant="tertiary"
              size="sm"
              leftSection={<RestartAltIcon sx={{ fontSize: "1rem" }} />}
              onClick={resetSidebarCategories}
            >
              {t("fileSidebar.groupsModal.reset", "Reset to defaults")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              {t("fileSidebar.groupsModal.done", "Done")}
            </Button>
          </div>
        }
      >
        <div className="fsg-body">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={t("fileSidebar.groupsModal.search", "Search labels…")}
            size="sm"
            data-autofocus
          />

          {sortedCategories.map((category) => {
            const memberKeys = category.labelKeys.filter((key) =>
              matches(labelDisplay(key)),
            );
            // Show the category if its name matches, or any member label matches.
            if (!matches(category.name) && memberKeys.length === 0) return null;
            const isExpanded = q !== "" || expanded.has(category.id);
            const suggestions = [...vocab.keys()]
              .filter((key) => !category.labelKeys.includes(key))
              .map((key) => labelDisplay(key));
            return (
              <section key={category.id} className="fsg-cat">
                <div className="fsg-cat-header">
                  <ActionIcon
                    variant="quiet"
                    className="fsg-cat-toggle"
                    aria-expanded={isExpanded}
                    aria-label={category.name}
                    onClick={() => toggleExpanded(category.id)}
                  >
                    {isExpanded ? (
                      <KeyboardArrowDownIcon className="fsg-chevron" />
                    ) : (
                      <KeyboardArrowRightIcon className="fsg-chevron" />
                    )}
                  </ActionIcon>
                  <LabelIconPicker
                    value={category.icon}
                    onChange={(icon) => setCategoryIcon(category.id, icon)}
                    ariaLabel={t(
                      "fileSidebar.groupsModal.categoryIconAria",
                      "Choose an icon for {{name}}",
                      { name: category.name },
                    )}
                  />
                  {renaming === category.id ? (
                    <TextInput
                      className="fsg-rename"
                      size="xs"
                      value={renameDraft}
                      autoFocus
                      onChange={(e) => setRenameDraft(e.currentTarget.value)}
                      onBlur={() => commitRename(category.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(category.id);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    // eslint-disable-next-line no-restricted-syntax -- inline text button (click-to-rename); no DS Button variant fits an inline label
                    <button
                      type="button"
                      className="fsg-cat-name"
                      title={t("fileSidebar.groupsModal.rename", "Rename")}
                      onClick={() => {
                        setRenaming(category.id);
                        setRenameDraft(category.name);
                      }}
                    >
                      {category.name}
                    </button>
                  )}
                  <span className="fsg-count">
                    {categoryCounts.get(category.id) ?? 0}
                  </span>
                  <ActionIcon
                    variant="quiet"
                    className="fsg-cat-action"
                    aria-label={
                      category.hidden
                        ? t("fileSidebar.groupsModal.show", "Show category")
                        : t("fileSidebar.groupsModal.hide", "Hide category")
                    }
                    aria-pressed={!category.hidden}
                    onClick={() =>
                      setCategoryHidden(category.id, !category.hidden)
                    }
                  >
                    {category.hidden ? (
                      <VisibilityOffIcon sx={{ fontSize: "1rem" }} />
                    ) : (
                      <VisibilityIcon sx={{ fontSize: "1rem" }} />
                    )}
                  </ActionIcon>
                  <ActionIcon
                    variant="quiet"
                    className="fsg-cat-action"
                    aria-label={t(
                      "fileSidebar.groupsModal.delete",
                      "Delete category",
                    )}
                    onClick={() => deleteCategory(category.id)}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: "1rem" }} />
                  </ActionIcon>
                </div>

                {isExpanded && (
                  <div className="fsg-cat-body">
                    <div className="fsg-chips">
                      {memberKeys.map((key) => (
                        <LabelChip
                          key={key}
                          label={labelDisplay(key)}
                          icon={labelIcon(key)}
                          count={labelCounts.get(key)}
                          onRemove={() =>
                            removeLabelFromCategory(category.id, key)
                          }
                          removeAriaLabel={t(
                            "fileSidebar.groupsModal.removeLabel",
                            "Remove {{name}}",
                            { name: labelDisplay(key) },
                          )}
                        />
                      ))}
                    </div>
                    <div className="fsg-add">
                      <input
                        className="fsg-add-input"
                        list={`fsg-vocab-${category.id}`}
                        value={addDraft[category.id] ?? ""}
                        placeholder={t(
                          "fileSidebar.groupsModal.addLabel",
                          "Add a label…",
                        )}
                        onChange={(e) =>
                          setAddDraft((prev) => ({
                            ...prev,
                            [category.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addLabel(category.id);
                          }
                        }}
                      />
                      <datalist id={`fsg-vocab-${category.id}`}>
                        {suggestions.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftSection={<AddIcon sx={{ fontSize: "0.9rem" }} />}
                        onClick={() => addLabel(category.id)}
                        disabled={!(addDraft[category.id] ?? "").trim()}
                      >
                        {t("fileSidebar.groupsModal.add", "Add")}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          <div className="fsg-new">
            <input
              className="fsg-add-input"
              value={newCategory}
              placeholder={t(
                "fileSidebar.groupsModal.newCategory",
                "New category name…",
              )}
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
              leftSection={<AddIcon sx={{ fontSize: "0.9rem" }} />}
              onClick={createCategory}
              disabled={!newCategory.trim()}
            >
              {t("fileSidebar.groupsModal.createCategory", "Create category")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
