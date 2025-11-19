import { useMemo } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useTranslation } from "react-i18next";
import { getSynonyms } from "@app/utils/toolSynonyms";
import PdfTextEditor from "@app/tools/pdfTextEditor/PdfTextEditor";
import {
  SubcategoryId,
  ToolCategoryId,
  type ProprietaryToolRegistry,
} from "@app/data/toolsTaxonomy";

/**
 * Hook that provides the proprietary tool registry.
 *
 * This is the definition of all proprietary tools,
 * and will be included in the main tool registry.
 */
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  const { t } = useTranslation();

  return useMemo<ProprietaryToolRegistry>(() => ({
    pdfTextEditor: {
      icon: <LocalIcon icon="edit-square-outline-rounded" width="1.5rem" height="1.5rem" />,
      name: t("home.pdfTextEditor.title", "PDF Text Editor"),
      component: PdfTextEditor,
      description: t(
        "home.pdfTextEditor.desc",
        "Review and edit Stirling PDF JSON exports with grouped text editing and PDF regeneration"
      ),
      categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
      subcategoryId: SubcategoryId.GENERAL,
      workbench: "custom:pdfTextEditor",
      endpoints: ["json-pdf"],
      synonyms: getSynonyms(t, "pdfTextEditor"),
      supportsAutomate: false,
      automationSettings: null,
      versionStatus: "alpha",
      requiresPremium: true,
    },
  }), [t]);
}
