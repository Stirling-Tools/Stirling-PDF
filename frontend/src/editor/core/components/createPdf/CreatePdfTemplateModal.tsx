import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@editor/ui/Modal";
import { Input } from "@editor/ui/Input";
import { Icon } from "@editor/ui/Icon";
import { Skeleton } from "@editor/ui/Skeleton";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import {
  NEW_PDF_ORIENTATIONS,
  NEW_PDF_PAGE_SIZES,
  type NewPdfPageSetup,
  type PdfTemplate,
  type PdfTemplateCategory,
} from "@editor/services/createPdf/newPdfDocuments";
import { usePdfTemplateLabels } from "@editor/components/createPdf/usePdfTemplateLabels";
import {
  usePdfTemplateLibrary,
  useTemplatePreview,
} from "@editor/components/createPdf/useTemplatePreviews";
import styles from "@editor/components/createPdf/CreatePdfTemplateModal.module.css";

const MENU_FOCUS_RETURN_SETTLE_MS = 50;

type CategoryFilter = PdfTemplateCategory | "all";

interface CreatePdfTemplateModalProps {
  open: boolean;
  pageSetup: NewPdfPageSetup;
  onPageSetupChange: (setup: NewPdfPageSetup) => void;
  onClose: () => void;
  onSelect: (template: PdfTemplate) => void;
}

export function CreatePdfTemplateModal({
  open,
  pageSetup,
  onPageSetupChange,
  onClose,
  onSelect,
}: CreatePdfTemplateModalProps) {
  const { t } = useTranslation();
  const { templateName, categoryName, pageSizeName, orientationName } =
    usePdfTemplateLabels();
  const library = usePdfTemplateLibrary(open);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(
      () => searchRef.current?.focus(),
      MENU_FOCUS_RETURN_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open]);

  const templates = library?.PDF_TEMPLATES ?? [];
  const categories = library?.PDF_TEMPLATE_CATEGORIES ?? [];
  const search = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      templates.filter((template) =>
        search
          ? `${templateName(template)} ${template.keywords ?? ""}`
              .toLowerCase()
              .includes(search)
          : category === "all" || template.category === category,
      ),
    [templates, search, category, templateName],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={t("createPdf.templates.title", "Start from a template")}
      subtitle={t(
        "createPdf.templates.subtitle",
        "Pick a layout, then change any text in the editor.",
      )}
      footer={
        <div className={styles.footer}>
          <span className={styles.footerLabel}>
            {t("createPdf.pageSize", "Page size")}
          </span>
          <SegmentedControl
            options={NEW_PDF_PAGE_SIZES.map((size) => ({
              value: size,
              label: pageSizeName(size),
            }))}
            value={pageSetup.size}
            onChange={(size) => onPageSetupChange({ ...pageSetup, size })}
            ariaLabel={t("createPdf.pageSize", "Page size")}
          />
          <SegmentedControl
            options={NEW_PDF_ORIENTATIONS.map((orientation) => ({
              value: orientation,
              label: orientationName(orientation),
            }))}
            value={pageSetup.orientation}
            onChange={(orientation) =>
              onPageSetupChange({ ...pageSetup, orientation })
            }
            ariaLabel={t("createPdf.orientation", "Orientation")}
          />
        </div>
      }
    >
      <div className={styles.layout}>
        <div className={styles.toolbar}>
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("createPdf.templates.search", "Search templates")}
            aria-label={t("createPdf.templates.search", "Search templates")}
            leadingIcon={<Icon name="search" size={16} />}
            data-testid="create-pdf-template-search"
          />
        </div>
        <nav
          className={styles.categories}
          aria-label={t("createPdf.templates.categoriesLabel", "Categories")}
        >
          {(["all", ...categories] as CategoryFilter[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={styles.category}
              aria-current={!search && category === entry ? "true" : undefined}
              onClick={() => {
                setCategory(entry);
                setQuery("");
              }}
              data-testid={`create-pdf-category-${entry}`}
            >
              <span>{categoryName(entry)}</span>
              <span className={styles.count}>
                {entry === "all"
                  ? templates.length
                  : templates.filter((item) => item.category === entry).length}
              </span>
            </button>
          ))}
        </nav>
        {shown.length === 0 && library ? (
          <p className={styles.empty}>
            {t(
              "createPdf.templates.noMatch",
              "No templates match your search.",
            )}
          </p>
        ) : (
          <ul className={styles.templates} data-testid="create-pdf-templates">
            {shown.map((template) => (
              <li key={template.id}>
                <TemplateCard
                  template={template}
                  name={templateName(template)}
                  pageSetup={pageSetup}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

interface TemplateCardProps {
  template: PdfTemplate;
  name: string;
  pageSetup: NewPdfPageSetup;
  onSelect: (template: PdfTemplate) => void;
}

function TemplateCard({
  template,
  name,
  pageSetup,
  onSelect,
}: TemplateCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const preview = useTemplatePreview(template, pageSetup, cardRef);
  const shape =
    pageSetup.orientation === "landscape" ? styles.landscape : styles.page;
  return (
    <button
      ref={cardRef}
      type="button"
      className={styles.card}
      onClick={() => onSelect(template)}
      data-testid={`create-pdf-template-${template.id}`}
    >
      <span className={styles.preview} aria-hidden>
        {preview ? (
          <img className={shape} src={preview} alt="" />
        ) : (
          <Skeleton shape="rect" className={shape} width="100%" height="100%" />
        )}
      </span>
      <span className={styles.title}>{name}</span>
    </button>
  );
}
