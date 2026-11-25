import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useDeleteAllTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "changeMetadata.tooltip.deleteAll.title",
        "Remove Existing Metadata",
      ),
    },
    tips: [
      {
        description: t(
          "changeMetadata.tooltip.deleteAll.text",
          "Complete metadata deletion to ensure privacy.",
        ),
      },
    ],
  };
};

export const useStandardMetadataTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "changeMetadata.tooltip.standardFields.title",
        "Standard Fields",
      ),
    },
    tips: [
      {
        description: t(
          "changeMetadata.tooltip.standardFields.text",
          "Common PDF metadata fields that describe the document.",
        ),
      },
    ],
  };
};

export const useDocumentDatesTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.dates.title", "Date Fields"),
    },
    tips: [
      {
        description: t(
          "changeMetadata.tooltip.dates.text",
          "When the document was created and modified.",
        ),
      },
    ],
  };
};

export const useAdvancedOptionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changeMetadata.tooltip.advanced.title", "Advanced Options"),
    },
    tips: [
      {
        title: t(
          "changeMetadata.tooltip.advanced.trapped.title",
          "Trapped Status",
        ),
        description: t(
          "changeMetadata.tooltip.advanced.trapped.description",
          "Indicates if document is prepared for high-quality printing.",
        ),
        bullets: [
          t(
            "changeMetadata.tooltip.advanced.trapped.bullet1",
            "True: Document has been trapped for printing",
          ),
          t(
            "changeMetadata.tooltip.advanced.trapped.bullet2",
            "False: Document has not been trapped",
          ),
          t(
            "changeMetadata.tooltip.advanced.trapped.bullet3",
            "Unknown: Trapped status is not specified",
          ),
        ],
      },
      {
        title: t(
          "changeMetadata.tooltip.customFields.title",
          "Custom Metadata",
        ),
        description: t(
          "changeMetadata.tooltip.customFields.text",
          "Add your own custom key-value metadata pairs.",
        ),
      },
    ],
  };
};
