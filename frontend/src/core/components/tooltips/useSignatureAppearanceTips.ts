import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useSignatureAppearanceTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("certSign.appearance.tooltip.header.title", "About Signature Appearance")
    },
    tips: [
      {
        title: t("certSign.appearance.tooltip.invisible.title", "Invisible Signatures"),
        description: t("certSign.appearance.tooltip.invisible.text", "The signature is added to the PDF for security but won't be visible when viewing the document. Perfect for legal requirements without changing the document's appearance."),
        bullets: [
          t("certSign.appearance.tooltip.invisible.bullet1", "Provides security without visual changes"),
          t("certSign.appearance.tooltip.invisible.bullet2", "Meets legal requirements for digital signing"),
          t("certSign.appearance.tooltip.invisible.bullet3", "Doesn't affect document layout or design")
        ]
      },
      {
        title: t("certSign.appearance.tooltip.visible.title", "Visible Signatures"),
        description: t("certSign.appearance.tooltip.visible.text", "Shows a signature block on the PDF with your name, date, and optional details. Useful when you want readers to clearly see the document is signed."),
        bullets: [
          t("certSign.appearance.tooltip.visible.bullet1", "Shows signer name and date on the document"),
          t("certSign.appearance.tooltip.visible.bullet2", "Can include reason and location for signing"),
          t("certSign.appearance.tooltip.visible.bullet3", "Choose which page to place the signature"),
          t("certSign.appearance.tooltip.visible.bullet4", "Optional logo can be included")
        ]
      }
    ]
  };
};