import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useCertificateTypeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("manageSignatures.certType.tooltip.header.title", "About Certificate Types")
    },
    tips: [
      {
        title: t("manageSignatures.certType.tooltip.what.title", "What's a certificate?"),
        description: t("manageSignatures.certType.tooltip.what.text", "It's a secure ID for your signature that proves you signed. Unless you're required to sign via certificate, we recommend using another secure method like Type, Draw, or Upload.")
      },
      {
        title: t("manageSignatures.certType.tooltip.which.title", "Which option should I use?"),
        description: t("manageSignatures.certType.tooltip.which.text", "Choose the format that matches your certificate file:"),
        bullets: [
          t("manageSignatures.certType.tooltip.which.bullet1", "PKCS#12 (.p12 / .pfx) – one combined file (most common)"),
          t("manageSignatures.certType.tooltip.which.bullet2", "PEM – separate private-key and certificate .pem files"),
          t("manageSignatures.certType.tooltip.which.bullet3", "JKS – Java .jks keystore for dev / CI-CD workflows"),
          t("manageSignatures.certType.tooltip.which.bullet4", "SERVER – use server's certificate (no files needed)")
        ]
      },
      {
        title: t("manageSignatures.certType.tooltip.convert.title", "Key not listed?"),
        description: t("manageSignatures.certType.tooltip.convert.text", "Convert your file to a Java keystore (.jks) with keytool, then pick JKS.")
      }
    ]
  };
};