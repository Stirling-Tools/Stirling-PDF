import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useManageSignaturesTooltips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("manageSignatures.tooltip.header.title", "About Managing Signatures")
    },
    tips: [
      {
        title: t("manageSignatures.tooltip.overview.title", "What can this tool do?"),
        description: t("manageSignatures.tooltip.overview.text", "This tool lets you check if your PDFs are digitally signed and add new digital signatures. Digital signatures prove who created or approved a document and show if it has been changed since signing."),
        bullets: [
          t("manageSignatures.tooltip.overview.bullet1", "Check existing signatures and their validity"),
          t("manageSignatures.tooltip.overview.bullet2", "View detailed information about signers and certificates"),
          t("manageSignatures.tooltip.overview.bullet3", "Add new digital signatures to secure your documents"),
          t("manageSignatures.tooltip.overview.bullet4", "Multiple files supported with easy navigation")
        ]
      },
      {
        title: t("manageSignatures.tooltip.validation.title", "Checking Signatures"),
        description: t("manageSignatures.tooltip.validation.text", "When you check signatures, the tool tells you if they're valid, who signed the document, when it was signed, and whether the document has been changed since signing."),
        bullets: [
          t("manageSignatures.tooltip.validation.bullet1", "Shows if signatures are valid or invalid"),
          t("manageSignatures.tooltip.validation.bullet2", "Displays signer information and signing date"),
          t("manageSignatures.tooltip.validation.bullet3", "Checks if the document was modified after signing"),
          t("manageSignatures.tooltip.validation.bullet4", "Can use custom certificates for verification")
        ]
      },
      {
        title: t("manageSignatures.tooltip.signing.title", "Adding Signatures"),
        description: t("manageSignatures.tooltip.signing.text", "To sign a PDF, you need a digital certificate (like PEM, PKCS12, or JKS). You can choose to make the signature visible on the document or keep it invisible for security only."),
        bullets: [
          t("manageSignatures.tooltip.signing.bullet1", "Supports PEM, PKCS12, and JKS certificate formats"),
          t("manageSignatures.tooltip.signing.bullet2", "Option to show or hide signature on the PDF"),
          t("manageSignatures.tooltip.signing.bullet3", "Add reason, location, and signer name"),
          t("manageSignatures.tooltip.signing.bullet4", "Choose which page to place visible signatures")
        ]
      }
    ]
  };
};