import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useFlattenTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("flatten.tooltip.header.title", "About Flattening PDFs")
    },
    tips: [
      {
        title: t("flatten.tooltip.description.title", "What does flattening do?"),
        description: t("flatten.tooltip.description.text", "Flattening makes your PDF non-editable by turning fillable forms and buttons into regular text and images. The PDF will look exactly the same, but no one can change or fill in the forms anymore. Perfect for sharing completed forms, creating final documents for records, or ensuring the PDF looks the same everywhere."),
        bullets: [
          t("flatten.tooltip.description.bullet1", "Text boxes become regular text (can't be edited)"),
          t("flatten.tooltip.description.bullet2", "Checkboxes and buttons become pictures"),
          t("flatten.tooltip.description.bullet3", "Great for final versions you don't want changed"),
          t("flatten.tooltip.description.bullet4", "Ensures consistent appearance across all devices")
        ]
      },
      {
        title: t("flatten.tooltip.formsOnly.title", "What does 'Flatten only forms' mean?"),
        description: t("flatten.tooltip.formsOnly.text", "This option only removes the ability to fill in forms, but keeps other features working like clicking links, viewing bookmarks, and reading comments."),
        bullets: [
          t("flatten.tooltip.formsOnly.bullet1", "Forms become non-editable"),
          t("flatten.tooltip.formsOnly.bullet2", "Links still work when clicked"),
          t("flatten.tooltip.formsOnly.bullet3", "Comments and notes remain visible"),
          t("flatten.tooltip.formsOnly.bullet4", "Bookmarks still help you navigate")
        ]
      }
    ]
  };
};