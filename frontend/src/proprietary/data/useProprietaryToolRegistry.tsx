import { useMemo } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useTranslation } from "react-i18next";
import { getSynonyms } from "@app/utils/toolSynonyms";
import PdfJsonEditor from "@app/tools/pdfJsonEditor/PdfJsonEditor";
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
    pdfJsonEditor: {
      icon: <LocalIcon icon="code-rounded" width="1.5rem" height="1.5rem" />,
      name: t("home.pdfJsonEditor.title", "PDF JSON Editor"),
      component: PdfJsonEditor,
      description: t(
        "home.pdfJsonEditor.desc",
        "Review and edit Stirling PDF JSON exports with grouped text editing and PDF regeneration"
      ),
      categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
      subcategoryId: SubcategoryId.GENERAL,
      workbench: "custom:pdfJsonEditor",
      endpoints: ["json-pdf"],
      synonyms: getSynonyms(t, "pdfJsonEditor"),
      supportsAutomate: false,
      automationSettings: null,
    },
  }), [t]);
}
