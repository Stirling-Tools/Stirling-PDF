import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useChangeMetadataTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.header.title", "PDF Metadata Overview")
    },
    tips: [
      {
        title: t("changeMetadata.tooltip.standardFields.title", "Standard Fields"),
        description: t("changeMetadata.tooltip.standardFields.text", "Common PDF metadata fields that describe the document."),
        bullets: [
          t("changeMetadata.tooltip.standardFields.bullet1", "Title: Document name or heading"),
          t("changeMetadata.tooltip.standardFields.bullet2", "Author: Person who created the document"),
          t("changeMetadata.tooltip.standardFields.bullet3", "Subject: Brief description of content"),
          t("changeMetadata.tooltip.standardFields.bullet4", "Keywords: Search terms for the document"),
          t("changeMetadata.tooltip.standardFields.bullet5", "Creator/Producer: Software used to create the PDF")
        ]
      },
      {
        title: t("changeMetadata.tooltip.dates.title", "Date Fields"),
        description: t("changeMetadata.tooltip.dates.text", "When the document was created and modified."),
        bullets: [
          t("changeMetadata.tooltip.dates.bullet1", "Creation Date: When original document was made"),
          t("changeMetadata.tooltip.dates.bullet2", "Modification Date: When last changed"),
          t("changeMetadata.tooltip.dates.bullet3", "Format: yyyy/MM/dd HH:mm:ss (e.g., 2025/01/17 14:30:00)")
        ]
      },
      {
        title: t("changeMetadata.tooltip.options.title", "Additional Options"),
        description: t("changeMetadata.tooltip.options.text", "Custom fields and privacy controls."),
        bullets: [
          t("changeMetadata.tooltip.options.bullet1", "Custom Metadata: Add your own key-value pairs"),
          t("changeMetadata.tooltip.options.bullet2", "Trapped Status: High-quality printing setting"),
          t("changeMetadata.tooltip.options.bullet3", "Delete All: Remove all metadata for privacy")
        ]
      }
    ]
  };
};
