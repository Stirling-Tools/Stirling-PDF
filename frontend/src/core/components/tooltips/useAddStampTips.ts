import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAddStampSetupTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("AddStampRequest.help.title", "Stamp Tool Help")
    },
    tips: [
      {
        title: t("AddStampRequest.help.overview", "Overview"),
        description: t("AddStampRequest.help.overview", "Add text or image stamps to PDFs at precise locations. Supports variable substitution and multi-language fonts.")
      },
      {
        title: t("AddStampRequest.help.stampTypes", "Stamp Types"),
        description: "",
        bullets: [
          t("AddStampRequest.help.textStamp", "Text: Quick approval stamps ('APPROVED', 'REVIEWED', 'CONFIDENTIAL'), custom messages"),
          t("AddStampRequest.help.imageStamp", "Image: Upload logos, signatures, or custom graphics")
        ]
      },
      {
        title: t("AddStampRequest.help.variables", "Variable Substitution (Text Stamps)"),
        description: t("AddStampRequest.help.variablesDesc", "Use these variables in your stamp text for dynamic content:"),
        bullets: [
          t("AddStampRequest.help.variableN", "{n} - Current page number"),
          t("AddStampRequest.help.variableTotal", "{total} - Total pages"),
          t("AddStampRequest.help.variableFilename", "{filename} - Document filename"),
          t("AddStampRequest.help.variableExample", "Example: 'Document {filename} - Page {n}' becomes 'Document myfile - Page 5'")
        ]
      },
      {
        title: t("AddStampRequest.help.multiLanguage", "Multi-Language Support"),
        description: t("AddStampRequest.help.multiLanguageDesc", "Choose alphabet/language for proper font rendering: Roman, Arabic, Japanese, Korean, Chinese, Thai. Essential for non-Latin text.")
      },
      {
        title: t("AddStampRequest.help.useCases", "Common Use Cases"),
        description: "",
        bullets: [
          t("AddStampRequest.help.useCase1", "Approval stamps: 'APPROVED', 'REVIEWED BY [NAME]', 'CONFIDENTIAL'"),
          t("AddStampRequest.help.useCase2", "Business stamps: Company logos, official seals"),
          t("AddStampRequest.help.useCase3", "Page references: 'Page {n} of {total}'"),
          t("AddStampRequest.help.useCase4", "Document identifiers: '{filename} - {n}'")
        ]
      }
    ]
  };
};

export const useAddStampPositionTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("AddStampRequest.help.positioningTitle", "Positioning & Formatting")
    },
    tips: [
      {
        title: t("AddStampRequest.help.positioning", "Positioning System"),
        description: "",
        bullets: [
          t("AddStampRequest.help.positionGrid", "Quick Position: Use 1-9 grid (1=top-left, 5=center, 9=bottom-right) for fast placement"),
          t("AddStampRequest.help.positionOverride", "Override Coordinates: Enter exact X/Y pixel coordinates for precise placement (overrides grid position)"),
          t("AddStampRequest.help.positionMargin", "Custom Margin: Adjust distance from page edges (Small/Medium/Large/X-Large)")
        ]
      },
      {
        title: t("AddStampRequest.help.formatting", "Formatting Options"),
        description: "",
        bullets: [
          t("AddStampRequest.help.rotation", "Rotation: -360° to 360° for angled stamps"),
          t("AddStampRequest.help.opacity", "Opacity: 0-100% for transparency (lower = more transparent)"),
          t("AddStampRequest.help.color", "Custom Colour: Choose any colour for text stamps"),
          t("AddStampRequest.help.fontSize", "Font/Image Size: Adjust size of text or image stamps")
        ]
      },
      {
        title: t("AddStampRequest.help.previewTip", "Preview Tip"),
        description: t("AddStampRequest.help.previewTipDesc", "Use the preview to see how your stamp will look before applying. For image stamps, you can drag to position or use the quick grid.")
      }
    ]
  };
};
