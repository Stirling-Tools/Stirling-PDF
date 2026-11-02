import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useSignModeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "certSign.signMode.tooltip.header.title",
        "About PDF Signatures",
      ),
    },
    tips: [
      {
        description: t(
          "certSign.signMode.tooltip.overview.text",
          "All three sources seal the document, so any later edit is flagged as tampering, and record who signed, when and how. Whether a viewer shows the signature as trusted depends on the certificate chain.",
        ),
      },
      {
        title: t(
          "certSign.signMode.tooltip.upload.title",
          "Upload - bring your certificate",
        ),
        description: t(
          "certSign.signMode.tooltip.upload.text",
          "Use your own certificate and key files. Viewer trust depends on whether the certificate chain is recognised, just as it does for a device certificate.",
        ),
      },
      {
        title: t(
          "certSign.signMode.tooltip.server.title",
          "Server - configured certificate",
        ),
        description: t(
          "certSign.signMode.tooltip.server.text",
          "Signs with the certificate configured on the server. The same tamper-evident seal and audit trail, with no per-user certificate handling.",
        ),
      },
      {
        title: t(
          "certSign.signMode.tooltip.device.title",
          "This device - system certificate or token",
        ),
        description: t(
          "certSign.signMode.tooltip.device.text",
          "Uses a certificate from the local system store or a connected PKCS#11 token, so the private key never leaves the hardware it is installed on.",
        ),
      },
    ],
  };
};
