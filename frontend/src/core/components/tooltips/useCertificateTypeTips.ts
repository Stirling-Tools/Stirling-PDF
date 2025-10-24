import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useCertificateTypeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("certSign.certType.tooltip.header.title", "About Certificate Types")
    },
    tips: [
      {
        title: t("certSign.certType.tooltip.what.title", "What's a certificate?"),
        description: t("certSign.certType.tooltip.what.text", "It's a secure ID for your signature that proves you signed. Unless you're required to sign via certificate, we recommend using another secure method like Type, Draw, or Upload.")
      },
      {
        title: t("certSign.certType.tooltip.which.title", "Which option should I use?"),
        description: t("certSign.certType.tooltip.which.text", "Choose the format that matches your certificate file:"),
        bullets: [
          t("certSign.certType.tooltip.which.bullet1", "PKCS12 (.p12) – one combined file (most common)"),
          t("certSign.certType.tooltip.which.bullet2", "PFX (.pfx) – Microsoft's version of PKCS12"),
          t("certSign.certType.tooltip.which.bullet3", "PEM – separate private-key and certificate .pem files"),
          t("certSign.certType.tooltip.which.bullet4", "JKS – Java .jks keystore for dev / CI-CD workflows")
        ]
      },
      {
        title: t("certSign.certType.tooltip.convert.title", "Key not listed?"),
        description: t("certSign.certType.tooltip.convert.text", "Convert your file to a Java keystore (.jks) with keytool, then pick JKS.")
      }
    ]
  };
};