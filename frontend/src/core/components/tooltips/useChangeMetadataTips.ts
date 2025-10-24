import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useDeleteAllTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.deleteAll.title", "Remove Existing Metadata")
    },
    tips: [
      {
        description: t("changeMetadata.tooltip.deleteAll.text", "Complete metadata deletion to ensure privacy."),
      }
    ]
  };
};

export const useStandardMetadataTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.standardFields.title", "Standard Fields")
    },
    tips: [
      {
        description: t("changeMetadata.tooltip.standardFields.text", "Common PDF metadata fields that describe the document."),
        bullets: [
          t("changeMetadata.tooltip.standardFields.bullet1", "Title: Document name or heading"),
          t("changeMetadata.tooltip.standardFields.bullet2", "Author: Person who created the document"),
          t("changeMetadata.tooltip.standardFields.bullet3", "Subject: Brief description of content"),
          t("changeMetadata.tooltip.standardFields.bullet4", "Keywords: Search terms for the document"),
          t("changeMetadata.tooltip.standardFields.bullet5", "Creator/Producer: Software used to create the PDF")
        ]
      }
    ]
  };
};

export const useDocumentDatesTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.dates.title", "Date Fields")
    },
    tips: [
      {
        description: t("changeMetadata.tooltip.dates.text", "When the document was created and modified."),
        bullets: [
          t("changeMetadata.tooltip.dates.bullet1", "Creation Date: When original document was made"),
          t("changeMetadata.tooltip.dates.bullet2", "Modification Date: When last changed"),
        ]
      }
    ]
  };
};

export const useCustomMetadataTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.customFields.title", "Custom Metadata")
    },
    tips: [
      {
        description: t("changeMetadata.tooltip.customFields.text", "Add your own custom key-value metadata pairs."),
        bullets: [
          t("changeMetadata.tooltip.customFields.bullet1", "Add any custom fields relevant to your document"),
          t("changeMetadata.tooltip.customFields.bullet2", "Examples: Department, Project, Version, Status"),
          t("changeMetadata.tooltip.customFields.bullet3", "Both key and value are required for each entry")
        ]
      }
    ]
  };
};

export const useAdvancedOptionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.advanced.title", "Advanced Options")
    },
    tips: [
      {
        title: t("changeMetadata.tooltip.advanced.trapped.title", "Trapped Status"),
        description: t("changeMetadata.tooltip.advanced.trapped.description", "Indicates if document is prepared for high-quality printing."),
        bullets: [
          t("changeMetadata.tooltip.advanced.trapped.bullet1", "True: Document has been trapped for printing"),
          t("changeMetadata.tooltip.advanced.trapped.bullet2", "False: Document has not been trapped"),
          t("changeMetadata.tooltip.advanced.trapped.bullet3", "Unknown: Trapped status is not specified")
        ]
      },
      {
        title: t("changeMetadata.tooltip.customFields.title", "Custom Metadata"),
        description: t("changeMetadata.tooltip.customFields.text", "Add your own custom key-value metadata pairs."),
        bullets: [
          t("changeMetadata.tooltip.customFields.bullet1", "Add any custom fields relevant to your document"),
          t("changeMetadata.tooltip.customFields.bullet2", "Examples: Department, Project, Version, Status"),
          t("changeMetadata.tooltip.customFields.bullet3", "Both key and value are required for each entry")
        ]
      }
    ]
  };
};
