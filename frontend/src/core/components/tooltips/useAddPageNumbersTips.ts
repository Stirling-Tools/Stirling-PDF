import { useTranslation } from 'react-i18next';
import { TooltipContent, TooltipTip } from '@app/types/tips';

export const useAddPageNumbersTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("addPageNumbers.help.title", "Page Numbers & Bates Numbering Help")
    },
    tips: [
      {
        title: t("addPageNumbers.help.variables", "Variable Substitution"),
        description: t("addPageNumbers.help.variablesDesc", "Use these variables in the Custom Text Format field to create dynamic page numbering:"),
        bullets: [
          t("addPageNumbers.help.variableN", "{n} - Current page number"),
          t("addPageNumbers.help.variableTotal", "{total} - Total number of pages"),
          t("addPageNumbers.help.variableFilename", "{filename} - Document filename (without extension)")
        ]
      },
      {
        title: t("addPageNumbers.help.examples", "Common Examples"),
        description: "",
        bullets: [
          t("addPageNumbers.help.exampleSimple", "Simple numbering: {n} → 1, 2, 3, 4..."),
          t("addPageNumbers.help.examplePageOf", "Page X of Y: Page {n} of {total} → Page 1 of 10, Page 2 of 10..."),
          t("addPageNumbers.help.exampleBates", "Legal Bates numbering: ABC-{n} → ABC-001, ABC-002, ABC-003..."),
          t("addPageNumbers.help.exampleDocument", "Document reference: {filename}-{n} → mydoc-001, mydoc-002..."),
          t("addPageNumbers.help.exampleCustom", "Custom format: Doc {filename} | Page {n}/{total}")
        ]
      },
      {
        title: t("addPageNumbers.help.positioning", "Positioning"),
        description: t("addPageNumbers.help.positioningDesc", "Use the 1-9 grid system to quickly position page numbers, or use the margin size to adjust distance from edges.")
      },
      {
        title: t("addPageNumbers.help.tips", "Tips"),
        description: "",
        bullets: [
          t("addPageNumbers.help.tip1", "Starting Number: Change the starting number to begin counting from any value (useful for multi-part documents)"),
          t("addPageNumbers.help.tip2", "Page Selection: Number only specific pages by entering ranges like 1,3,5-8"),
          t("addPageNumbers.help.tip3", "Formatting: Choose font type, size, and color to match your document style")
        ]
      }
    ]
  };
};
