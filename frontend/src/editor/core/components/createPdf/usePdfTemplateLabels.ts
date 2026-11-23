import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  NewPdfOrientation,
  NewPdfPageSize,
  PdfTemplate,
  PdfTemplateCategory,
} from "@editor/services/createPdf/newPdfDocuments";

const CATEGORY_NAMES: Record<PdfTemplateCategory, string> = {
  paper: "Paper",
  documents: "Documents",
  business: "Business",
  forms: "Forms",
  planning: "Planning",
  design: "Design",
};

const ORIENTATION_NAMES: Record<NewPdfOrientation, string> = {
  portrait: "Portrait",
  landscape: "Landscape",
};

const PAGE_SIZE_NAMES: Record<NewPdfPageSize, string> = {
  A4: "A4",
  LETTER: "Letter",
  LEGAL: "Legal",
  A5: "A5",
};

export function usePdfTemplateLabels() {
  const { t } = useTranslation();
  const templateName = useCallback(
    (template: PdfTemplate) =>
      t(`createPdf.templates.names.${template.id}`, template.title),
    [t],
  );
  const categoryName = useCallback(
    (category: PdfTemplateCategory | "all") =>
      category === "all"
        ? t("createPdf.templates.all", "All templates")
        : t(
            `createPdf.templates.categories.${category}`,
            CATEGORY_NAMES[category],
          ),
    [t],
  );
  const pageSizeName = useCallback(
    (size: NewPdfPageSize) =>
      t(`createPdf.pageSizes.${size}`, PAGE_SIZE_NAMES[size]),
    [t],
  );
  const orientationName = useCallback(
    (orientation: NewPdfOrientation) =>
      t(
        `createPdf.orientations.${orientation}`,
        ORIENTATION_NAMES[orientation],
      ),
    [t],
  );
  return { templateName, categoryName, pageSizeName, orientationName };
}
