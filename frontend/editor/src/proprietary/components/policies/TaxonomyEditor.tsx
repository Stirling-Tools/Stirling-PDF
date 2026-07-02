/**
 * Editable view of a classification taxonomy: a table of categories, each with a
 * collapsible, indented list of sub-categories (doc types), plus the
 * free-standing tags. Purely presentational — it renders a draft and emits a new
 * draft on every edit; the owner decides when to persist. Ids are never edited
 * directly: they're derived from the label (lowercased, spaces → hyphens) and
 * shown read-only. `readOnly` renders the same layout without edit affordances.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Input } from "@shared/components/Input";
import { Button } from "@shared/components/Button";
import { slugify } from "@app/utils/slug";
import type {
  ClassificationTaxonomy,
  DocumentCategory,
} from "@app/data/classificationTaxonomy";
import "@app/components/policies/TaxonomyEditor.css";

interface TaxonomyEditorProps {
  value: ClassificationTaxonomy;
  onChange: (next: ClassificationTaxonomy) => void;
  readOnly?: boolean;
}

export function TaxonomyEditor({
  value,
  onChange,
  readOnly = false,
}: TaxonomyEditorProps) {
  const { t } = useTranslation();
  // Track expansion by category index (stable while editing, since ids change
  // as labels are typed and rows aren't reordered).
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [newTag, setNewTag] = useState("");

  const toggle = (index: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const setCategories = (categories: DocumentCategory[]) =>
    onChange({ ...value, categories });

  const updateCategory = (index: number, patch: Partial<DocumentCategory>) =>
    setCategories(
      value.categories.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );

  const renameCategory = (index: number, label: string) =>
    updateCategory(index, { label, id: slugify(label) });

  const addCategory = () => {
    setExpanded((prev) => new Set(prev).add(value.categories.length));
    setCategories([...value.categories, { id: "", label: "", docTypes: [] }]);
  };

  const removeCategory = (index: number) =>
    setCategories(value.categories.filter((_, i) => i !== index));

  const renameDocType = (catIndex: number, docIndex: number, label: string) =>
    updateCategory(catIndex, {
      docTypes: value.categories[catIndex].docTypes.map((d, i) =>
        i === docIndex ? { id: slugify(label), label } : d,
      ),
    });

  const addDocType = (catIndex: number) => {
    setExpanded((prev) => new Set(prev).add(catIndex));
    updateCategory(catIndex, {
      docTypes: [...value.categories[catIndex].docTypes, { id: "", label: "" }],
    });
  };

  const removeDocType = (catIndex: number, docIndex: number) =>
    updateCategory(catIndex, {
      docTypes: value.categories[catIndex].docTypes.filter(
        (_, i) => i !== docIndex,
      ),
    });

  const addTag = () => {
    const tag = slugify(newTag);
    if (tag === "" || value.tags.includes(tag)) return;
    onChange({ ...value, tags: [...value.tags, tag] });
    setNewTag("");
  };

  const removeTag = (tag: string) =>
    onChange({ ...value, tags: value.tags.filter((tg) => tg !== tag) });

  return (
    <div className="tax-editor">
      <div className="tax-table" role="table">
        <div className="tax-head" role="row">
          <span className="tax-head-label">
            {t("policies.taxonomy.categoryLabel", "Category")}
          </span>
          <span className="tax-head-id">{t("policies.taxonomy.id", "ID")}</span>
          {!readOnly && <span className="tax-head-actions" aria-hidden />}
        </div>

        {value.categories.length === 0 && (
          <div className="tax-empty-row">
            {t(
              "policies.taxonomy.emptyCategories",
              "No categories yet — add one to get started.",
            )}
          </div>
        )}

        {value.categories.map((category, catIndex) => {
          const isOpen = expanded.has(catIndex);
          return (
            <div className="tax-group" key={catIndex}>
              <div className="tax-row tax-row-category" role="row">
                <button
                  type="button"
                  className="tax-toggle"
                  onClick={() => toggle(catIndex)}
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? t("policies.taxonomy.collapse", "Collapse")
                      : t("policies.taxonomy.expand", "Expand")
                  }
                >
                  {isOpen ? (
                    <ExpandMoreIcon sx={{ fontSize: "1.15rem" }} />
                  ) : (
                    <ChevronRightIcon sx={{ fontSize: "1.15rem" }} />
                  )}
                </button>
                <div className="tax-name">
                  {readOnly ? (
                    <span className="tax-label-text">{category.label}</span>
                  ) : (
                    <Input
                      inputSize="sm"
                      value={category.label}
                      onChange={(e) => renameCategory(catIndex, e.target.value)}
                      placeholder={t(
                        "policies.taxonomy.categoryLabel",
                        "Category",
                      )}
                      aria-label={t(
                        "policies.taxonomy.categoryLabel",
                        "Category",
                      )}
                    />
                  )}
                  <span className="tax-subcount">
                    {t("policies.taxonomy.subCount", "{{count}} sub", {
                      count: category.docTypes.length,
                    })}
                  </span>
                </div>
                <code className="tax-id-text">{category.id}</code>
                {!readOnly && (
                  <button
                    type="button"
                    className="tax-icon-btn tax-icon-btn-danger"
                    onClick={() => removeCategory(catIndex)}
                    aria-label={t(
                      "policies.taxonomy.removeCategory",
                      "Remove category",
                    )}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: "1.15rem" }} />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="tax-subs">
                  {category.docTypes.map((docType, docIndex) => (
                    <div
                      className="tax-row tax-row-doctype"
                      role="row"
                      key={docIndex}
                    >
                      <div className="tax-name">
                        {readOnly ? (
                          <span className="tax-label-text">
                            {docType.label}
                          </span>
                        ) : (
                          <Input
                            inputSize="sm"
                            value={docType.label}
                            onChange={(e) =>
                              renameDocType(catIndex, docIndex, e.target.value)
                            }
                            placeholder={t(
                              "policies.taxonomy.subLabel",
                              "Sub-category",
                            )}
                            aria-label={t(
                              "policies.taxonomy.subLabel",
                              "Sub-category",
                            )}
                          />
                        )}
                      </div>
                      <code className="tax-id-text">{docType.id}</code>
                      {!readOnly && (
                        <button
                          type="button"
                          className="tax-icon-btn tax-icon-btn-danger"
                          onClick={() => removeDocType(catIndex, docIndex)}
                          aria-label={t(
                            "policies.taxonomy.removeSub",
                            "Remove sub-category",
                          )}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: "1.05rem" }} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <button
                      type="button"
                      className="tax-add-sub"
                      onClick={() => addDocType(catIndex)}
                    >
                      <AddIcon sx={{ fontSize: "1rem" }} />
                      {t("policies.taxonomy.addSub", "Add sub-category")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<AddIcon sx={{ fontSize: "1rem" }} />}
          onClick={addCategory}
        >
          {t("policies.taxonomy.addCategory", "Add category")}
        </Button>
      )}

      <div className="tax-tags">
        <p className="pol-section-label">
          {t("policies.taxonomy.tags", "Tags")}
        </p>
        <div className="tax-tag-list">
          {value.tags.length === 0 && (
            <span className="tax-empty">
              {t("policies.taxonomy.noTags", "No tags yet.")}
            </span>
          )}
          {value.tags.map((tag) => (
            <span className="tax-tag" key={tag}>
              <span className="tax-tag-label">{tag}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="tax-tag-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={t(
                    "policies.taxonomy.removeTag",
                    "Remove {{tag}}",
                    { tag },
                  )}
                >
                  <CloseIcon sx={{ fontSize: "0.85rem" }} />
                </button>
              )}
            </span>
          ))}
        </div>
        {!readOnly && (
          <div className="tax-tag-add">
            <Input
              inputSize="sm"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder={t(
                "policies.taxonomy.addTagPlaceholder",
                "Add a tag",
              )}
              aria-label={t("policies.taxonomy.addTag", "Add a tag")}
            />
            <Button variant="ghost" size="sm" onClick={addTag}>
              {t("policies.taxonomy.add", "Add")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
